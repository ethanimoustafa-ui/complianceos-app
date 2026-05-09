export function translateTimelineTitle(
  title: string,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  const EXACT: Record<string, string> = {
    'Draft Created':          t('samaLetters.letterCreatedDraft'),
    'Submitted for Approval': t('samaLetters.letterSubmittedApproval'),
    'Compliance Approved':    t('samaLetters.complianceApproved'),
    'All Steps Approved':     t('samaLetters.allStepsApproved'),
    // Legacy literals (pre-authority): keep mapping so old persisted timelines still translate
    'Sent to SAMA':           t('samaLetters.letterSentToSama'),
    'Pending SAMA Reply':     t('samaLetters.pendingSamaReply'),
    'Pending SAMA reply':     t('samaLetters.pendingSamaReply'),
    'Response Received':      t('samaLetters.letterResponseReceived'),
  }
  if (EXACT[title]) return EXACT[title]

  // Dynamic authority forms: 'Sent to <AUTHORITY>' / 'Pending <AUTHORITY> reply'
  const sentMatch = title.match(/^Sent to ([A-Z]+)$/)
  if (sentMatch) return t('samaLetters.letterSentToAuthority', { authority: sentMatch[1] })
  const pendingMatch = title.match(/^Pending ([A-Z]+) (?:Reply|reply)$/)
  if (pendingMatch) return t('samaLetters.pendingAuthorityReply', { authority: pendingMatch[1] })

  // Translate legacy "Field updated" events from the removed editLetter feature
  const FIELD_UPDATED: Record<string, string> = {
    'Subject updated':               t('samaLetters.subjectUpdated'),
    'Arabic Subject updated':        t('samaLetters.subjectArUpdated'),
    'Body updated':                  t('samaLetters.bodyUpdated'),
    'Arabic Body updated':           t('samaLetters.bodyArUpdated'),
    'Priority updated':              t('samaLetters.priorityUpdated'),
    'SAMA Department updated':       t('samaLetters.departmentUpdated'),
    'Letter Type updated':           t('samaLetters.letterTypeUpdated'),
    'Sub-Category updated':          t('samaLetters.subCategoryUpdated'),
    'Signer Name updated':           t('samaLetters.signerNameUpdated'),
    'Signer Title updated':          t('samaLetters.signerTitleUpdated'),
    'Recipient Name updated':        t('samaLetters.recipientNameUpdated'),
    'Recipient Organization updated':t('samaLetters.recipientOrgUpdated'),
  }
  if (FIELD_UPDATED[title]) return FIELD_UPDATED[title]

  if (title.startsWith('Approved by '))
    return `${t('samaLetters.approvedBy')} ${title.slice('Approved by '.length)}`

  if (title.startsWith('Rejected by ')) {
    // Translate legacy "No reason provided" suffix stored in older events
    const rest = title.slice('Rejected by '.length)
      .replace('No reason provided', t('samaLetters.noReasonProvided'))
    return `${t('samaLetters.rejectedBy')} ${rest}`
  }

  return title
}
