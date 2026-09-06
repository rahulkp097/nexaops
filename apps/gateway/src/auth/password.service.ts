import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;

@Injectable()
export class PasswordService {
  hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, SALT_ROUNDS);
  }

  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await bcrypt.compare(plain, hash);
    } catch {
      return false;
    }
  }
}
