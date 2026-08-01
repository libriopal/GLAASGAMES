/**
 * §6 gate: economy is invisible to under-21/self-excluded accounts, no
 * message ever solicits reversing self-exclusion, anti-manipulation
 * invariants hold, PDX is never purchasable, and stake release carries no bonus.
 *
 * Run: npm run verify:economy   ·   Exit 0 = gate held.
 */

import type { Account, AccountMessage, PurchaseCatalogItem, SessionUXConfig, StakeRelease } from './types.ts';
import {
  canReverseSelfExclusion,
  economyVisible,
  verifyAntiManipulation,
  verifyEconomyInvisibility,
  verifyNoStakeBonus,
  verifyPdxNeverPurchasable,
  verifySelfExclusionNoSolicit,
} from './rules.ts';

let failures = 0;
const ok = (cond: boolean, msg: string) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) failures++;
};

const under21: Account = { id: 'a-minor', ageVerified21Plus: false, selfExcluded: false };
const adult: Account = { id: 'a-adult', ageVerified21Plus: true, selfExcluded: false };
const excludedAdult: Account = {
  id: 'a-excluded',
  ageVerified21Plus: true,
  selfExcluded: true,
  selfExclusionCoolingOffUntil: '2026-09-01T00:00:00Z',
};

// 1. economyVisible — same one code path, two triggers.
ok(!economyVisible(under21), 'economy is invisible for an under-21 account');
ok(economyVisible(adult), 'economy is visible for a verified 21+, non-excluded account');
ok(!economyVisible(excludedAdult), 'economy is invisible for a self-excluded 21+ account (same mechanism as age gate)');

// 2. Cooling-off period gates reversal.
ok(!canReverseSelfExclusion(excludedAdult, new Date('2026-08-01T00:00:00Z')), 'self-exclusion cannot be reversed before the cooling-off date');
ok(canReverseSelfExclusion(excludedAdult, new Date('2026-09-02T00:00:00Z')), 'self-exclusion can be reversed after the cooling-off date');

// 3. verify-economy-invisibility — catches a real rendering violation.
const accounts = [under21, adult, excludedAdult];
ok(verifyEconomyInvisibility(accounts, ['a-adult']).passed, 'rendering economy only for the eligible adult account passes');
ok(!verifyEconomyInvisibility(accounts, ['a-adult', 'a-minor']).passed, 'rendering economy for the under-21 account is caught');
ok(!verifyEconomyInvisibility(accounts, ['a-adult', 'a-excluded']).passed, 'rendering economy for the self-excluded account is caught');

// 4. verify-self-exclusion-no-solicit.
const cleanMessages: AccountMessage[] = [
  { accountId: 'a-excluded', messageType: 'system', content: 'Your account settings were updated.', promptsReversal: false },
];
const solicitingMessages: AccountMessage[] = [
  { accountId: 'a-excluded', messageType: 'promo', content: 'Come back and reactivate your voidcrystal staking today!', promptsReversal: false },
];
const flaggedMessages: AccountMessage[] = [
  { accountId: 'a-excluded', messageType: 'reminder', content: 'Just checking in.', promptsReversal: true },
];
ok(verifySelfExclusionNoSolicit(accounts, cleanMessages).passed, 'a neutral system message to a self-excluded account passes');
ok(!verifySelfExclusionNoSolicit(accounts, solicitingMessages).passed, 'a message pattern-matching "come back"/"reactivate" is caught');
ok(!verifySelfExclusionNoSolicit(accounts, flaggedMessages).passed, 'a message explicitly flagged promptsReversal=true is caught even with neutral wording');
ok(
  verifySelfExclusionNoSolicit(accounts, [{ accountId: 'a-adult', messageType: 'promo', content: 'Come back and stake more!', promptsReversal: false }]).passed,
  'the same wording sent to a NON-excluded account is not a self-exclusion violation',
);

// 5. verify-anti-manipulation.
const cleanUx: SessionUXConfig = { hasDarkPatterns: false, hasLossFraming: false, hasArtificialScarcityTimer: false, hasStreakPunishment: false, sessionEndIsGraceful: true };
ok(verifyAntiManipulation(cleanUx).passed, 'a clean session UX config passes anti-manipulation checks');
ok(!verifyAntiManipulation({ ...cleanUx, hasLossFraming: true }).passed, 'loss-framing is caught');
ok(!verifyAntiManipulation({ ...cleanUx, sessionEndIsGraceful: false }).passed, 'an abrupt (non-graceful) session end is caught');

// 6. PDX is never purchasable — verify-pdx-never-purchasable.
const cleanCatalog: PurchaseCatalogItem[] = [
  { sku: 'role-unlock-1', grants: 'roleUnlock' },
  { sku: 'voidcrystal-stake-30d', grants: 'voidcrystalStake' },
];
const dirtyCatalog: PurchaseCatalogItem[] = [...cleanCatalog, { sku: 'pdx-pack-100', grants: 'pdx' }];
ok(verifyPdxNeverPurchasable(cleanCatalog).passed, 'a catalog with no PDX SKU passes');
ok(!verifyPdxNeverPurchasable(dirtyCatalog).passed, 'a catalog offering PDX for purchase is caught');

// 7. Stake release carries no bonus — principal-out equals principal-in, exactly.
const fairRelease: StakeRelease = { stakeId: 's1', principal: 1000, payout: 1000 };
const bonusRelease: StakeRelease = { stakeId: 's2', principal: 1000, payout: 1020 };
ok(verifyNoStakeBonus(fairRelease), 'a stake release returning exactly principal passes (no bonus)');
ok(!verifyNoStakeBonus(bonusRelease), 'a stake release paying out more than principal (the removed ~2% bonus) is caught');

console.log('');
if (failures === 0) {
  console.log('§6 GATE HELD: economy invisibility, self-exclusion, anti-manipulation, and PDX/stake rules all hold.');
  process.exit(0);
} else {
  console.log(`${failures} CHECK(S) FAILED.`);
  process.exit(1);
}
