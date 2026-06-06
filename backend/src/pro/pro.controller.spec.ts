import { Test, TestingModule } from '@nestjs/testing';
import { ProController } from './pro.controller';

describe('ProController', () => {
  let controller: ProController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProController],
    }).compile();

    controller = module.get<ProController>(ProController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
