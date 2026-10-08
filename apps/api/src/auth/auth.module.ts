import { Global, Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';
import { AccessTokenService } from './access-token.service';

@Global()
@Module({
  controllers: [AuthController],
  providers: [AuthService, SessionService, AccessTokenService],
  exports: [SessionService, AccessTokenService],
})
export class AuthModule {}
