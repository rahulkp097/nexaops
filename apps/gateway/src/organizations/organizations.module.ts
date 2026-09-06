import { Module } from '@nestjs/common';
import { OrganizationsRepository } from './organizations.repository';

@Module({
  providers: [OrganizationsRepository],
  exports: [OrganizationsRepository],
})
export class OrganizationsModule {}
