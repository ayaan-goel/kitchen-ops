import { Module } from '@nestjs/common';
import { OrderingModule } from '../ordering/ordering.module';
import { CustomersController, PlatformAdminController } from './admin.controller';
import { CompaniesService } from './companies.service';
import { EmployeesService } from './employees.service';
import { SettingsAdminService } from './settings-admin.service';
import { StaffService } from './staff.service';

@Module({
  imports: [OrderingModule],
  controllers: [CustomersController, PlatformAdminController],
  providers: [CompaniesService, EmployeesService, StaffService, SettingsAdminService],
})
export class AdminModule {}
