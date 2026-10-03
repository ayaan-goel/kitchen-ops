import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { EmployeeMenuDto, MenuDishDto } from '@fernleaf/shared';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { ClockService } from '../../src/common/clock/clock.service';

export type Agent = ReturnType<typeof request.agent>;

export async function createTestApp(fixedNow: Date): Promise<NestExpressApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
  configureApp(app);
  await app.init();
  app.get(ClockService).setFixedNow(fixedNow);
  return app;
}

export async function login(app: NestExpressApplication, email: string, password = 'Test@1234'): Promise<Agent> {
  const agent = request.agent(app.getHttpServer());
  const res = await agent.post('/api/auth/login').set('X-Requested-With', 'fetch').send({ email, password });
  if (res.status !== 200) throw new Error(`Login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  return agent;
}

/** Mutating requests must carry the CSRF header. */
export const post = (agent: Agent, url: string, body: object) => agent.post(url).set('X-Requested-With', 'fetch').send(body);
export const put = (agent: Agent, url: string, body: object) => agent.put(url).set('X-Requested-With', 'fetch').send(body);

export function findDish(menu: EmployeeMenuDto, sku: string): MenuDishDto {
  const dish = [...menu.listed, ...menu.secret].flatMap((c) => c.items).find((i) => i.dish.sku === sku)?.dish;
  if (!dish) throw new Error(`Dish ${sku} not on this menu`);
  return dish;
}

/** One combination of the paneer bowl: Paneer + the given rice (Regular) + Mild. */
export function bowlCombo(dish: MenuDishDto, quantity: number, rice = 'Jeera rice') {
  const group = (name: string) => dish.groups.find((g) => g.name === name)!;
  const opt = (groupName: string, optionName: string) => group(groupName).options.find((o) => o.name === optionName)!;
  const riceOption = opt('Choose your rice', rice);
  return {
    quantity,
    selections: [
      { groupId: group('Choose your protein').id, optionId: opt('Choose your protein', 'Paneer').optionId },
      { groupId: group('Choose your rice').id, optionId: riceOption.optionId, portionSizeId: riceOption.portions.find((p) => p.name === 'Regular')!.portionSizeId },
      { groupId: group('Spice level').id, optionId: opt('Spice level', 'Mild').optionId },
    ],
  };
}
