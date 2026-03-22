import { Injectable } from '@nestjs/common';

@Injectable()
export class RolesService {
  canCreate(projectRole: string, level: 'EPIC' | 'FEATURE' | 'STORY') {
    if (projectRole === 'ADMIN' || projectRole === 'PRODUCT_OWNER') return true;
    if (projectRole === 'ENGINEER' && level !== 'EPIC') return true;
    return false;
  }
}
