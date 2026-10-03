import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  addressInputSchema,
  type CompanyDetailDto,
  companyCreateSchema,
  type CompanyListItemDto,
  companyUpdateSchema,
  domainInputSchema,
  type EmployeeDetailDto,
  type EmployeeImportReportDto,
  employeeInputSchema,
  type EmployeeListItemDto,
  employeeListQuerySchema,
  employeeMoveSchema,
  holidayInputSchema,
  menuVisibilitySchema,
  type Paginated,
  type RoleDto,
  type SettingsDto,
  settingsUpdateSchema,
  staffCreateSchema,
  type StaffDto,
  staffPasswordSchema,
  staffUpdateSchema,
  uuidSchema,
} from '@fernleaf/shared';
import { z } from 'zod';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, RequirePermissions } from '../../common/auth/decorators';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { CompaniesService, fail } from './companies.service';
import { EmployeesService } from './employees.service';
import { SettingsAdminService } from './settings-admin.service';
import { StaffService } from './staff.service';

const idParam = new ZodValidationPipe(uuidSchema);
const pipe = <T extends z.ZodType>(schema: T) => new ZodValidationPipe(schema);

/** Companies and employees (TRD §6.6, §6.7). */
@Controller()
export class CustomersController {
  constructor(
    private readonly companies: CompaniesService,
    private readonly employees: EmployeesService,
  ) {}

  @Get('companies')
  @RequirePermissions('companies.read')
  list(): Promise<CompanyListItemDto[]> {
    return this.companies.list();
  }

  @Post('companies')
  @RequirePermissions('companies.manage')
  create(@Body(pipe(companyCreateSchema)) body: z.infer<typeof companyCreateSchema>): Promise<CompanyDetailDto> {
    return this.companies.create(body);
  }

  @Get('companies/:id')
  @RequirePermissions('companies.read')
  get(@Param('id', idParam) id: string): Promise<CompanyDetailDto> {
    return this.companies.get(id);
  }

  @Put('companies/:id')
  @RequirePermissions('companies.manage')
  update(@Param('id', idParam) id: string, @Body(pipe(companyUpdateSchema)) body: z.infer<typeof companyUpdateSchema>): Promise<CompanyDetailDto> {
    return this.companies.update(id, body);
  }

  @Post('companies/:id/domains')
  @RequirePermissions('companies.manage')
  addDomain(@Param('id', idParam) id: string, @Body(pipe(domainInputSchema)) body: z.infer<typeof domainInputSchema>) {
    return this.companies.addDomain(id, body.domain);
  }

  @Delete('companies/:id/domains/:domainId')
  @RequirePermissions('companies.manage')
  removeDomain(@Param('id', idParam) id: string, @Param('domainId', idParam) domainId: string) {
    return this.companies.removeDomain(id, domainId);
  }

  @Post('companies/:id/addresses')
  @RequirePermissions('companies.manage')
  addAddress(@Param('id', idParam) id: string, @Body(pipe(addressInputSchema)) body: z.infer<typeof addressInputSchema>) {
    return this.companies.addAddress(id, body);
  }

  @Put('companies/:id/addresses/:addressId')
  @RequirePermissions('companies.manage')
  updateAddress(@Param('id', idParam) id: string, @Param('addressId', idParam) addressId: string, @Body(pipe(addressInputSchema)) body: z.infer<typeof addressInputSchema>) {
    return this.companies.updateAddress(id, addressId, body);
  }

  @Post('companies/:id/holidays')
  @RequirePermissions('companies.manage')
  addHoliday(@Param('id', idParam) id: string, @Body(pipe(holidayInputSchema)) body: z.infer<typeof holidayInputSchema>) {
    return this.companies.addHoliday(id, body.date, body.name);
  }

  @Delete('companies/:id/holidays/:holidayId')
  @RequirePermissions('companies.manage')
  removeHoliday(@Param('id', idParam) id: string, @Param('holidayId', idParam) holidayId: string) {
    return this.companies.removeHoliday(id, holidayId);
  }

  @Put('companies/:id/menu-visibility')
  @RequirePermissions('companies.manage')
  visibility(@Param('id', idParam) id: string, @Body(pipe(menuVisibilitySchema)) body: z.infer<typeof menuVisibilitySchema>) {
    return this.companies.setVisibility(id, body);
  }

  @Post('companies/:id/employees/import')
  @RequirePermissions('employees.manage')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 1024 * 1024, files: 1 } }))
  import(
    @Param('id', idParam) id: string,
    @UploadedFile() file: { buffer: Buffer } | undefined,
    @Query(pipe(z.object({ dryRun: z.enum(['true', 'false']).default('true') }))) q: { dryRun: 'true' | 'false' },
  ): Promise<EmployeeImportReportDto> {
    if (!file?.buffer.length) throw fail('VALIDATION_FAILED', 'file', 'Choose a CSV file.');
    return this.employees.import(id, file.buffer.toString('utf8'), q.dryRun === 'true');
  }

  @Get('employees')
  @RequirePermissions('employees.read')
  employeesList(@Query(pipe(employeeListQuerySchema)) q: z.infer<typeof employeeListQuerySchema>): Promise<Paginated<EmployeeListItemDto>> {
    return this.employees.list(q);
  }

  @Post('employees')
  @RequirePermissions('employees.manage')
  employeeCreate(@Body(pipe(employeeInputSchema)) body: z.infer<typeof employeeInputSchema>): Promise<EmployeeDetailDto> {
    return this.employees.create(body);
  }

  @Get('employees/:id')
  @RequirePermissions('employees.read')
  employee(@Param('id', idParam) id: string): Promise<EmployeeDetailDto> {
    return this.employees.get(id);
  }

  @Put('employees/:id')
  @RequirePermissions('employees.manage')
  employeeUpdate(@Param('id', idParam) id: string, @Body(pipe(employeeInputSchema)) body: z.infer<typeof employeeInputSchema>): Promise<EmployeeDetailDto> {
    return this.employees.update(id, body);
  }

  @Post('employees/:id/move')
  @RequirePermissions('employees.manage')
  move(@Param('id', idParam) id: string, @Body(pipe(employeeMoveSchema)) body: z.infer<typeof employeeMoveSchema>): Promise<EmployeeDetailDto> {
    return this.employees.move(id, body.companyId, body.email);
  }
}

/** Staff, roles and platform settings (TRD §6.1, §6.15). */
@Controller()
export class PlatformAdminController {
  constructor(
    private readonly staff: StaffService,
    private readonly settings: SettingsAdminService,
  ) {}

  @Get('roles')
  @RequirePermissions('staff.read')
  roles(): Promise<RoleDto[]> {
    return this.staff.roles();
  }

  @Get('staff')
  @RequirePermissions('staff.read')
  staffList(): Promise<StaffDto[]> {
    return this.staff.list();
  }

  @Post('staff')
  @RequirePermissions('staff.manage')
  staffCreate(@Body(pipe(staffCreateSchema)) body: z.infer<typeof staffCreateSchema>): Promise<StaffDto[]> {
    return this.staff.create(body);
  }

  @Patch('staff/:id')
  @RequirePermissions('staff.manage')
  staffUpdate(@Param('id', idParam) id: string, @Body(pipe(staffUpdateSchema)) body: z.infer<typeof staffUpdateSchema>, @CurrentUser() user: AuthUser): Promise<StaffDto[]> {
    return this.staff.update(id, body, user);
  }

  @Post('staff/:id/password')
  @RequirePermissions('staff.manage')
  staffPassword(@Param('id', idParam) id: string, @Body(pipe(staffPasswordSchema)) body: z.infer<typeof staffPasswordSchema>): Promise<StaffDto[]> {
    return this.staff.setPassword(id, body.password);
  }

  @Get('settings')
  @RequirePermissions('settings.read')
  getSettings(): Promise<SettingsDto> {
    return this.settings.get();
  }

  @Put('settings')
  @RequirePermissions('settings.manage')
  updateSettings(@Body(pipe(settingsUpdateSchema)) body: z.infer<typeof settingsUpdateSchema>, @CurrentUser() user: AuthUser): Promise<SettingsDto> {
    return this.settings.update(body, user);
  }

  @Post('settings/kitchen-holidays')
  @RequirePermissions('settings.manage')
  addHoliday(@Body(pipe(holidayInputSchema)) body: z.infer<typeof holidayInputSchema>): Promise<SettingsDto> {
    return this.settings.addHoliday(body.date, body.name);
  }

  @Delete('settings/kitchen-holidays/:id')
  @RequirePermissions('settings.manage')
  removeHoliday(@Param('id', idParam) id: string): Promise<SettingsDto> {
    return this.settings.removeHoliday(id);
  }
}
