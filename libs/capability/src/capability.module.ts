import { Module } from '@nestjs/common';
import { DEFAULT_CAPABILITIES } from './capability.default';
import { CapabilityRegistry } from './capability.registry';

/** CapabilityRegistry Injection Token */
export const CAPABILITY_REGISTRY = 'CAPABILITY_REGISTRY';

@Module({
  providers: [
    {
      provide: CAPABILITY_REGISTRY,
      useFactory: () => new CapabilityRegistry(DEFAULT_CAPABILITIES),
    },
  ],
  exports: [CAPABILITY_REGISTRY],
})
export class CapabilityModule {}
