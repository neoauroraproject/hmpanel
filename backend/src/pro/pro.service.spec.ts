import { Test, TestingModule } from '@nestjs/testing';
import { ProService } from './pro.service';

describe('ProService', () => {
  let service: ProService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ProService],
    }).compile();

    service = module.get<ProService>(ProService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
