import { Test, TestingModule } from '@nestjs/testing';
import { DomainsController } from './domains.controller';

describe('DomainsController', () => {
  let controller: DomainsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DomainsController],
    }).compile();

    controller = module.get<DomainsController>(DomainsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
