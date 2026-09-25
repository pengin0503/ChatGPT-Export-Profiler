import type { TranslationKey } from './en';

export const ja: Record<TranslationKey, string> = {
  'app.name': 'ChatGPT Export Profiler',
  'app.tagline': 'ChatGPTエクスポートを外部送信せずに解析します。',
  'privacy.local': '解析はこのブラウザ内でローカルに完結します。APIキーは不要で、バックエンド、テレメトリ、CDNへアップロードしません。',
  'import.action': 'エクスポートZIPを読み込む',
  'import.empty': 'ChatGPTのデータエクスポートZIPを選択すると、ローカル解析を開始できます。',
  'import.fileLabel': 'ChatGPTエクスポートZIPを選択',
  'import.inspecting': 'エクスポートZIPを検査中…',
  'import.duplicate': '既存の解析が見つかりました',
  'import.duplicateDetail': '同じエクスポートの完了済みローカル解析があります。既存結果を開くか、再解析できます。',
  'import.openExisting': '既存結果を開く',
  'import.reanalyze': '再解析',
  'import.safetyBlocked': 'ZIPはローカル安全検査を通過しませんでした。',
  'import.failed': '読み込みを完了できませんでした。',
  'import.complete': '読み込み完了',
  'nav.import': '読み込み',
  'nav.overview': '概要',
  'nav.timeline': 'タイムライン',
  'nav.models': 'モデル',
  'nav.conversations': '会話',
  'nav.cost': 'コスト',
  'nav.tools': 'ツール',
  'nav.comparison': '比較',
  'nav.dataQuality': 'データ品質',
  'nav.settings': '設定',
  'status.notReady': '読み込み後に利用可能'
};
