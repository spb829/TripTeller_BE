import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { ApiOperation } from '@nestjs/swagger';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({ summary: '서버 실행환경 테스트', description: '현재 서버의 실행환경을 출력한다.' })
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('healthCheck')
  @ApiOperation({ summary: 'Health Check API', description: '현재 서버의 상태가 정상인지 여부를 확인한다.' })
  getHealthCheck(): string {
    return this.appService.getHealthCheck();
  }

  @Get('ErrorTest')
  @ApiOperation({ summary: 'Exception filters API', description: 'Exception filters의 동작 여부를 확인한다.' })
  async test() {
    return this.appService.getTestError();
  }
}
