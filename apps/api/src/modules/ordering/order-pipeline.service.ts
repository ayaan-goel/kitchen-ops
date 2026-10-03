import { Injectable } from '@nestjs/common';
import {
  type CalendarDate,
  deliveryDayStatus,
  fromDbDate,
  type LineInput,
  plannedTimes,
  type PricedOrder,
  priceOrderLines,
  zonedInstant,
} from '@fernleaf/domain';
import { type ErrorIssue, minutesToTime, timeToMinutes } from '@fernleaf/shared';
import type { AuthUser } from '../../common/auth/auth-user';
import { ClockService } from '../../common/clock/clock.service';
import { NotFound } from '../../common/errors/domain-error';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CutoffService } from '../cutoff/cutoff.service';
import { PlatformSettingsService } from '../settings/platform-settings.service';
import { type CompanyMenu, MenuCatalogueService } from './menu-catalogue.service';

export const TIME_STEP_MINUTES = 15;

export interface PipelineInput {
  employeeId: string;
  deliveryDate: CalendarDate;
  deliveryTime?: string;
  addressId?: string;
  packagingTypeId?: string;
  lines: LineInput[];
  intent: 'DRAFT' | 'PLACE' | 'QUOTE';
  actor: AuthUser;
  /** Current values of an order being edited: keeping them never needs an employee permission. */
  existing?: { deliveryTime: number; addressId: string; packagingTypeId: string; companyId: string };
}

export interface PipelineWarning {
  path: (string | number)[];
  message: string;
}

export interface PipelineResult {
  issues: ErrorIssue[];
  warnings: PipelineWarning[];
  priced: PricedOrder;
  locked: boolean;
  cutoffAt: Date;
  /** Everything needed to persist the order (valid only when `issues` is empty). */
  context: {
    employeeId: string;
    companyId: string;
    tierId: string;
    deliveryDate: CalendarDate;
    deliveryTime: number;
    deliveryAt: Date;
    addressId: string;
    addressSnapshot: string;
    packagingTypeId: string;
    dispatchLeadMinutes: number;
    plannedDispatchReadyAt: Date;
    plannedKitchenReadyAt: Date;
  };
}

const DAY_STATUS_MESSAGES: Record<string, string> = {
  KITCHEN_CLOSED: 'The kitchen does not cook on this day.',
  KITCHEN_HOLIDAY: 'The kitchen is closed for a holiday on this day.',
  COMPANY_CLOSED: 'The company does not receive deliveries on this weekday.',
  COMPANY_HOLIDAY: 'This is a company holiday.',
};

export function formatAddress(a: { label: string; line1: string; line2: string | null; city: string; postalCode: string }): string {
  return [a.label, a.line1, a.line2, `${a.city} ${a.postalCode}`].filter(Boolean).join(', ');
}

/**
 * The single order-validation and pricing pipeline (ORD-01, ORD-02, TRD §6.8).
 * Used by the quote endpoint and by every write, so what staff see is what gets stored.
 * Collects every problem with a field path instead of stopping at the first.
 */
@Injectable()
export class OrderPipelineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
    private readonly settings: PlatformSettingsService,
    private readonly cutoff: CutoffService,
    private readonly catalogue: MenuCatalogueService,
  ) {}

  async evaluate(input: PipelineInput): Promise<PipelineResult> {
    const employee = await this.prisma.employee.findUnique({
      where: { id: input.employeeId },
      include: {
        allergens: { select: { allergenId: true } },
        dietaryPrefs: { select: { dietaryTagId: true } },
        company: {
          include: {
            addresses: { where: { isActive: true } },
            holidays: { select: { date: true } },
          },
        },
      },
    });
    if (!employee) throw new NotFound('Employee not found');

    const company = employee.company;
    const { settings, kitchen } = await this.settings.get();
    const issues: ErrorIssue[] = [];
    const warnings: PipelineWarning[] = [];
    const canOverride = input.actor.permissions.has('orders.override');

    // A moved employee's open orders stay with the original company (A-18).
    if (input.existing && input.existing.companyId !== company.id) {
      issues.push({
        path: ['employeeId'],
        code: 'VALIDATION_FAILED',
        message: `${employee.name} has moved to ${company.name}. Cancel this order and create a new one.`,
      });
    }

    // ── Date and cut-off ──
    const dayStatus = deliveryDayStatus(
      input.deliveryDate,
      kitchen,
      { workingDays: company.workingDays, holidays: new Set(company.holidays.map((h) => fromDbDate(h.date))) },
    );
    if (dayStatus !== 'OK') {
      issues.push({ path: ['deliveryDate'], code: 'DATE_NOT_DELIVERABLE', message: DAY_STATUS_MESSAGES[dayStatus]! });
    }
    const { cutoffAt, locked } = await this.cutoff.cutoffFor(input.deliveryDate);
    if (locked && input.intent !== 'QUOTE') {
      if (!canOverride) {
        issues.push({
          path: ['deliveryDate'],
          code: 'CUTOFF_PASSED',
          message: 'Ordering for this date has closed (cut-off passed). Only an admin can change it now.',
        });
      } else if (input.intent === 'DRAFT') {
        issues.push({
          path: ['deliveryDate'],
          code: 'CUTOFF_PASSED',
          message: 'The cut-off has passed, so this order can only be placed (it will be confirmed straight away), not saved as a draft.',
        });
      }
    }

    // ── Delivery options, per employee permission flags (EMP-02, A-19, A-20) ──
    const defaultAddressId = company.defaultAddressId ?? company.addresses[0]?.id ?? '';
    const keep = input.existing;

    let deliveryTime = keep?.deliveryTime ?? company.defaultDeliveryTime;
    if (input.deliveryTime !== undefined) {
      const minutes = timeToMinutes(input.deliveryTime);
      const unchanged = minutes === company.defaultDeliveryTime || minutes === keep?.deliveryTime;
      if (!unchanged && !employee.canChangeDeliveryTime) {
        issues.push({
          path: ['deliveryTime'],
          code: 'DELIVERY_OPTION_NOT_ALLOWED',
          message: `${employee.name} can’t change the delivery time (company default ${minutesToTime(company.defaultDeliveryTime)}).`,
        });
      } else if (!unchanged && (minutes < settings.deliveryWindowStart || minutes > settings.deliveryWindowEnd || minutes % TIME_STEP_MINUTES !== 0)) {
        issues.push({
          path: ['deliveryTime'],
          code: 'TIME_OUTSIDE_WINDOW',
          message: `Choose a time between ${minutesToTime(settings.deliveryWindowStart)} and ${minutesToTime(settings.deliveryWindowEnd)} in ${TIME_STEP_MINUTES}-minute steps.`,
        });
      } else {
        deliveryTime = minutes;
      }
    }

    let addressId = keep?.addressId ?? defaultAddressId;
    if (input.addressId !== undefined) {
      const address = company.addresses.find((a) => a.id === input.addressId);
      const unchanged = input.addressId === defaultAddressId || input.addressId === keep?.addressId;
      if (!address && input.addressId !== keep?.addressId) {
        issues.push({ path: ['addressId'], code: 'ADDRESS_INVALID', message: 'Choose one of the company’s active delivery addresses.' });
      } else if (!unchanged && !employee.canChooseAddress) {
        issues.push({ path: ['addressId'], code: 'DELIVERY_OPTION_NOT_ALLOWED', message: `${employee.name} can’t choose a delivery address.` });
      } else {
        addressId = input.addressId;
      }
    }

    let packagingTypeId = keep?.packagingTypeId ?? company.defaultPackagingTypeId;
    if (input.packagingTypeId !== undefined) {
      const unchanged = input.packagingTypeId === company.defaultPackagingTypeId || input.packagingTypeId === keep?.packagingTypeId;
      const packaging = await this.prisma.packagingType.findFirst({ where: { id: input.packagingTypeId, isActive: true }, select: { id: true } });
      if (!packaging && !unchanged) {
        issues.push({ path: ['packagingTypeId'], code: 'VALIDATION_FAILED', message: 'Choose an active packaging type.' });
      } else if (!unchanged && !employee.canChangePackaging) {
        issues.push({ path: ['packagingTypeId'], code: 'DELIVERY_OPTION_NOT_ALLOWED', message: `${employee.name} can’t change packaging.` });
      } else {
        packagingTypeId = input.packagingTypeId;
      }
    }

    // ── Menu, combinations, pricing (CAT-07…12, PRICE-05) ──
    const companyMenu: CompanyMenu = await this.catalogue.forCompany(company.id);
    const priced = priceOrderLines(input.lines, companyMenu.menu.orderable);
    issues.push(...priced.issues);
    if (input.intent === 'PLACE' && input.lines.length === 0) {
      issues.push({ path: ['lines'], code: 'VALIDATION_FAILED', message: 'Add at least one dish before placing the order.' });
    }

    // ── Allergy / diet warnings: never block (A-17) ──
    const allergies = new Set(employee.allergens.map((a) => a.allergenId));
    const diets = employee.dietaryPrefs.map((d) => d.dietaryTagId);
    priced.lines.forEach((line, i) => {
      const lineIndex = input.lines.findIndex((l) => l.dishId === line.dishId);
      line.combinations.forEach((combo, j) => {
        const path = ['lines', lineIndex === -1 ? i : lineIndex, 'combinations', j];
        const hits = combo.allergenIds.filter((id) => allergies.has(id)).map((id) => companyMenu.allergenNames.get(id) ?? id);
        if (hits.length > 0) {
          warnings.push({ path, message: `Contains ${hits.join(', ')}: ${employee.name} has declared this allergy.` });
        }
        const missed = diets.filter((d) => !combo.dietaryTagIds.includes(d)).map((d) => companyMenu.tagNames.get(d) ?? d);
        if (missed.length > 0) {
          warnings.push({ path, message: `Not ${missed.join(', ')}: ${employee.name} prefers ${missed.join(', ')}.` });
        }
      });
    });

    const deliveryAt = zonedInstant(input.deliveryDate, deliveryTime, this.clock.zone);
    const plan = plannedTimes(deliveryAt, company.dispatchLeadMinutes, settings.kitchenBufferMinutes);
    const address = company.addresses.find((a) => a.id === addressId);
    const addressSnapshot = address
      ? formatAddress(address)
      : ((await this.prisma.companyAddress.findUnique({ where: { id: addressId } }).then((a) => (a ? formatAddress(a) : ''))) ?? '');

    return {
      issues,
      warnings,
      priced,
      locked,
      cutoffAt,
      context: {
        employeeId: employee.id,
        companyId: company.id,
        tierId: companyMenu.tier.id,
        deliveryDate: input.deliveryDate,
        deliveryTime,
        deliveryAt,
        addressId,
        addressSnapshot,
        packagingTypeId,
        dispatchLeadMinutes: company.dispatchLeadMinutes,
        plannedDispatchReadyAt: plan.plannedDispatchReadyAt,
        plannedKitchenReadyAt: plan.plannedKitchenReadyAt,
      },
    };
  }
}
