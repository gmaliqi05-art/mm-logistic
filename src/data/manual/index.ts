import { companyManual } from './companyManual';
import { depotDepoistManual, depotReparatureManual } from './depotManual';
import { driverManual } from './driverManual';
import { accountingManual } from './accountingManual';
import { logisticsManual } from './logisticsManual';
import type { ManualSection } from './types';

export type ManualScope =
  | 'company'
  | 'depot_depoist'
  | 'depot_reparature'
  | 'driver'
  | 'accounting'
  | 'logistics';

// The company manual aggregates everything so administrators have a single
// reference. Each operational role sees only its own scope.
export function getManualSections(scope: ManualScope): ManualSection[] {
  switch (scope) {
    case 'company':
      return [
        companyManual,
        depotDepoistManual,
        depotReparatureManual,
        driverManual,
        accountingManual,
        logisticsManual,
      ];
    case 'depot_depoist':
      return [depotDepoistManual];
    case 'depot_reparature':
      return [depotReparatureManual];
    case 'driver':
      return [driverManual];
    case 'accounting':
      return [accountingManual];
    case 'logistics':
      return [logisticsManual];
  }
}

export type { ManualSection, ManualPage, ManualGroup, ManualBlock } from './types';
