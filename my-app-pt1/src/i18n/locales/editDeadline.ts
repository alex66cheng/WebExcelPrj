import { defineDict } from '../lang';

export default defineDict({
  en: {
    errSave: 'Failed to set the edit deadline',
    label: '⏰ Edit deadline:',
    set: 'Set',
    clear: 'Clear',
    statusNone: 'No deadline: collaborators can edit at any time.',
    statusExpired: 'Expired on {deadline}. Collaborators are now read-only (you can still edit).',
    statusActive: 'Collaborators can edit until {deadline}, then it becomes read-only (you are not restricted).',
  },
  ja: {
    errSave: '編集期限の設定に失敗しました',
    label: '⏰ 編集期限：',
    set: '設定',
    clear: 'クリア',
    statusNone: '期限なし：共同編集者はいつでも編集できます。',
    statusExpired: '{deadline} に期限切れ。共同編集者は現在読み取り専用です（あなたは引き続き編集できます）。',
    statusActive: '共同編集者は {deadline} まで編集でき、その後は読み取り専用になります（あなたは制限されません）。',
  },
  'zh-TW': {
    errSave: '設定編輯期限失敗',
    label: '⏰ 編輯期限：',
    set: '設定',
    clear: '清除',
    statusNone: '未設定期限：共同編輯者可隨時編輯。',
    statusExpired: '已於 {deadline} 到期，共同編輯者目前為唯讀（你本人仍可編輯）。',
    statusActive: '共同編輯者可編輯至 {deadline}，之後變為唯讀（你本人不受限制）。',
  },
});
