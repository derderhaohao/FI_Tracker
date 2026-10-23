import type { AccountType, AssetClass } from './entities';

export interface AccountDefaults {
  assetClass: AssetClass;
  investable: boolean;
  /** Age from which the money can be used (勞退: 60). */
  accessAge?: number;
}

/** Sensible defaults for a new account of each type; all are editable afterwards. */
export function accountDefaults(type: AccountType, pensionAccessAge = 60): AccountDefaults {
  switch (type) {
    case 'cash':
      return { assetClass: 'cash', investable: true };
    case 'brokerage':
      return { assetClass: 'tw_equity', investable: true };
    case 'pension':
      return { assetClass: 'other', investable: true, accessAge: pensionAccessAge };
    case 'insurance':
      return { assetClass: 'other', investable: false };
    case 'property':
      return { assetClass: 'property', investable: false };
    case 'liability':
      return { assetClass: 'other', investable: false };
  }
}
