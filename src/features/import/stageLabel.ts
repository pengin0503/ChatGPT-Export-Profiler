import type { TranslationKey } from '../../i18n';
import type { ImportStage } from '../../storage/db';

export function stageLabel(t: (key: TranslationKey) => string, stage: ImportStage): string {
  return t(`import.stage.${stage}`);
}
