#!/usr/bin/env ts-node
/**
 * i18n Audit Script for ComplianceOS
 *
 * This script analyzes the codebase for:
 * 1. Translation key usage - finds all t('...') calls and verifies keys exist
 * 2. RTL compliance - checks for proper RTL handling
 * 3. Hardcoded strings - finds hardcoded English text in JSX
 * 4. Date formatting - finds date formatting without locale parameter
 * 5. Month/day arrays - finds hardcoded month/day name arrays
 *
 * Usage: npx ts-node scripts/audit-i18n.ts
 */

import * as fs from 'fs'
import * as path from 'path'

// Configuration
const SRC_DIR = path.join(__dirname, '..', 'src')
const DICT_EN_PATH = path.join(SRC_DIR, 'i18n', 'dictionaries', 'en.json')
const DICT_AR_PATH = path.join(SRC_DIR, 'i18n', 'dictionaries', 'ar.json')

interface AuditResult {
  translationIssues: TranslationIssue[]
  rtlIssues: RTLIssue[]
  hardcodedStrings: HardcodedString[]
  dateFormatIssues: DateFormatIssue[]
  monthArrayIssues: MonthArrayIssue[]
}

interface TranslationIssue {
  file: string
  line: number
  key: string
  issue: 'missing_en' | 'missing_ar' | 'missing_both'
}

interface RTLIssue {
  file: string
  line: number
  issue: string
  context: string
}

interface HardcodedString {
  file: string
  line: number
  text: string
  context: string
}

interface DateFormatIssue {
  file: string
  line: number
  issue: string
  context: string
}

interface MonthArrayIssue {
  file: string
  line: number
  issue: string
  context: string
}

// Load dictionaries
function loadDictionary(filePath: string): Record<string, unknown> {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(content)
  } catch {
    console.error(`Failed to load dictionary: ${filePath}`)
    return {}
  }
}

// Flatten dictionary keys
function flattenKeys(obj: Record<string, unknown>, prefix = ''): Set<string> {
  const keys = new Set<string>()

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const nestedKeys = flattenKeys(value as Record<string, unknown>, fullKey)
      nestedKeys.forEach(k => keys.add(k))
    } else {
      keys.add(fullKey)
    }
  }

  return keys
}

// Get all TypeScript/TSX files
function getSourceFiles(dir: string, files: string[] = []): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)

    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.next') {
      getSourceFiles(fullPath, files)
    } else if (entry.isFile() && (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts'))) {
      files.push(fullPath)
    }
  }

  return files
}

// Find translation key usages
function findTranslationKeys(content: string, filePath: string, enKeys: Set<string>, arKeys: Set<string>): TranslationIssue[] {
  const issues: TranslationIssue[] = []
  const lines = content.split('\n')

  // Match t('key') or t("key") patterns
  const tCallRegex = /\bt\(\s*['"]([^'"]+)['"]\s*\)/g

  lines.forEach((line, index) => {
    let match
    while ((match = tCallRegex.exec(line)) !== null) {
      const key = match[1]
      const hasEn = enKeys.has(key)
      const hasAr = arKeys.has(key)

      if (!hasEn && !hasAr) {
        issues.push({
          file: filePath,
          line: index + 1,
          key,
          issue: 'missing_both'
        })
      } else if (!hasEn) {
        issues.push({
          file: filePath,
          line: index + 1,
          key,
          issue: 'missing_en'
        })
      } else if (!hasAr) {
        issues.push({
          file: filePath,
          line: index + 1,
          key,
          issue: 'missing_ar'
        })
      }
    }
  })

  return issues
}

// Find RTL issues
function findRTLIssues(content: string, filePath: string): RTLIssue[] {
  const issues: RTLIssue[] = []
  const lines = content.split('\n')

  // Check if file uses useTranslation
  const usesTranslation = content.includes('useTranslation')
  const hasIsRTL = content.includes('isRTL')

  if (usesTranslation && !hasIsRTL) {
    issues.push({
      file: filePath,
      line: 1,
      issue: 'Uses useTranslation but does not destructure isRTL',
      context: 'Component may need RTL support'
    })
  }

  // Check for flex containers without RTL handling
  lines.forEach((line, index) => {
    if (line.includes('flex') && line.includes('gap') && !line.includes('flex-row-reverse') && !line.includes('flex-col')) {
      // Only flag if the component uses isRTL but doesn't apply it here
      if (hasIsRTL && !line.includes('isRTL')) {
        issues.push({
          file: filePath,
          line: index + 1,
          issue: 'Flex container without RTL handling',
          context: line.trim().substring(0, 80)
        })
      }
    }
  })

  return issues
}

// Find hardcoded strings
function findHardcodedStrings(content: string, filePath: string): HardcodedString[] {
  const issues: HardcodedString[] = []
  const lines = content.split('\n')

  // Common patterns for hardcoded user-facing strings
  const patterns = [
    // JSX text content
    />([A-Z][a-z]+ [A-Za-z ]{10,})</,
    // Button/label text
    /(?:button|label|title|placeholder).*['"]([A-Z][a-z]+ [A-Za-z ]{5,})['"]/i,
  ]

  // Words that indicate UI text
  const uiIndicators = ['Submit', 'Cancel', 'Save', 'Delete', 'Edit', 'View', 'Add', 'Create', 'Update', 'Close']

  lines.forEach((line, index) => {
    // Skip import lines, comments, and type definitions
    if (line.trim().startsWith('import') || line.trim().startsWith('//') || line.trim().startsWith('*') || line.includes('interface') || line.includes('type ')) {
      return
    }

    // Check for potential hardcoded strings in JSX
    const jsxTextMatch = line.match(/>([A-Za-z][A-Za-z ]{4,})</g)
    if (jsxTextMatch) {
      jsxTextMatch.forEach(match => {
        const text = match.slice(1, -1)
        // Skip if it's a variable or component
        if (!text.includes('{') && !text.includes('<') && !/^[a-z]/.test(text)) {
          issues.push({
            file: filePath,
            line: index + 1,
            text,
            context: line.trim().substring(0, 80)
          })
        }
      })
    }
  })

  return issues
}

// Find date formatting issues
function findDateFormatIssues(content: string, filePath: string): DateFormatIssue[] {
  const issues: DateFormatIssue[] = []
  const lines = content.split('\n')

  lines.forEach((line, index) => {
    // Check for toLocaleDateString without locale
    if (line.includes('toLocaleDateString()') || line.includes("toLocaleDateString('en-US')") || line.includes('toLocaleDateString("en-US")')) {
      issues.push({
        file: filePath,
        line: index + 1,
        issue: 'Date formatting with hardcoded or missing locale',
        context: line.trim().substring(0, 80)
      })
    }

    // Check for formatDate/formatDateTime without locale parameter
    if ((line.includes('formatDate(') || line.includes('formatDateTime(')) && !line.includes('locale')) {
      // This is informational - the function now supports locale parameter
      issues.push({
        file: filePath,
        line: index + 1,
        issue: 'formatDate/formatDateTime call may need locale parameter',
        context: line.trim().substring(0, 80)
      })
    }
  })

  return issues
}

// Find month array issues
function findMonthArrayIssues(content: string, filePath: string): MonthArrayIssue[] {
  const issues: MonthArrayIssue[] = []
  const lines = content.split('\n')

  const monthPatterns = [
    /\['January'.*'December'\]/,
    /\['Jan'.*'Dec'\]/,
    /\['JAN'.*'DEC'\]/,
    /\['Sunday'.*'Saturday'\]/,
    /\['Sun'.*'Sat'\]/,
  ]

  lines.forEach((line, index) => {
    for (const pattern of monthPatterns) {
      if (pattern.test(line)) {
        issues.push({
          file: filePath,
          line: index + 1,
          issue: 'Hardcoded month/day names array',
          context: line.trim().substring(0, 80)
        })
        break
      }
    }
  })

  return issues
}

// Main audit function
function runAudit(): AuditResult {
  console.log('Loading dictionaries...')
  const enDict = loadDictionary(DICT_EN_PATH)
  const arDict = loadDictionary(DICT_AR_PATH)
  const enKeys = flattenKeys(enDict)
  const arKeys = flattenKeys(arDict)

  console.log(`English keys: ${enKeys.size}`)
  console.log(`Arabic keys: ${arKeys.size}`)

  console.log('\nScanning source files...')
  const sourceFiles = getSourceFiles(SRC_DIR)
  console.log(`Found ${sourceFiles.length} source files`)

  const result: AuditResult = {
    translationIssues: [],
    rtlIssues: [],
    hardcodedStrings: [],
    dateFormatIssues: [],
    monthArrayIssues: []
  }

  for (const file of sourceFiles) {
    const content = fs.readFileSync(file, 'utf-8')
    const relativePath = path.relative(SRC_DIR, file)

    result.translationIssues.push(...findTranslationKeys(content, relativePath, enKeys, arKeys))
    result.rtlIssues.push(...findRTLIssues(content, relativePath))
    result.hardcodedStrings.push(...findHardcodedStrings(content, relativePath))
    result.dateFormatIssues.push(...findDateFormatIssues(content, relativePath))
    result.monthArrayIssues.push(...findMonthArrayIssues(content, relativePath))
  }

  return result
}

// Generate report
function generateReport(result: AuditResult): void {
  console.log('\n' + '='.repeat(60))
  console.log('i18n AUDIT REPORT')
  console.log('='.repeat(60))

  // Translation Issues
  console.log('\n## TRANSLATION KEY ISSUES')
  console.log('-'.repeat(40))
  if (result.translationIssues.length === 0) {
    console.log('No translation key issues found!')
  } else {
    const grouped = result.translationIssues.reduce((acc, issue) => {
      acc[issue.issue] = acc[issue.issue] || []
      acc[issue.issue].push(issue)
      return acc
    }, {} as Record<string, TranslationIssue[]>)

    for (const [type, issues] of Object.entries(grouped)) {
      console.log(`\n### ${type} (${issues.length} issues)`)
      issues.slice(0, 10).forEach(issue => {
        console.log(`  ${issue.file}:${issue.line} - "${issue.key}"`)
      })
      if (issues.length > 10) {
        console.log(`  ... and ${issues.length - 10} more`)
      }
    }
  }

  // RTL Issues
  console.log('\n## RTL COMPLIANCE ISSUES')
  console.log('-'.repeat(40))
  if (result.rtlIssues.length === 0) {
    console.log('No RTL issues found!')
  } else {
    result.rtlIssues.slice(0, 20).forEach(issue => {
      console.log(`  ${issue.file}:${issue.line}`)
      console.log(`    Issue: ${issue.issue}`)
      console.log(`    Context: ${issue.context}`)
    })
    if (result.rtlIssues.length > 20) {
      console.log(`  ... and ${result.rtlIssues.length - 20} more`)
    }
  }

  // Date Format Issues
  console.log('\n## DATE FORMATTING ISSUES')
  console.log('-'.repeat(40))
  if (result.dateFormatIssues.length === 0) {
    console.log('No date formatting issues found!')
  } else {
    result.dateFormatIssues.forEach(issue => {
      console.log(`  ${issue.file}:${issue.line}`)
      console.log(`    Issue: ${issue.issue}`)
      console.log(`    Context: ${issue.context}`)
    })
  }

  // Month Array Issues
  console.log('\n## MONTH/DAY ARRAY ISSUES')
  console.log('-'.repeat(40))
  if (result.monthArrayIssues.length === 0) {
    console.log('No hardcoded month/day arrays found!')
  } else {
    result.monthArrayIssues.forEach(issue => {
      console.log(`  ${issue.file}:${issue.line}`)
      console.log(`    Issue: ${issue.issue}`)
      console.log(`    Context: ${issue.context}`)
    })
  }

  // Summary
  console.log('\n' + '='.repeat(60))
  console.log('SUMMARY')
  console.log('='.repeat(60))
  console.log(`Translation Issues: ${result.translationIssues.length}`)
  console.log(`RTL Issues: ${result.rtlIssues.length}`)
  console.log(`Hardcoded Strings: ${result.hardcodedStrings.length}`)
  console.log(`Date Format Issues: ${result.dateFormatIssues.length}`)
  console.log(`Month/Day Array Issues: ${result.monthArrayIssues.length}`)
  console.log(`TOTAL: ${result.translationIssues.length + result.rtlIssues.length + result.hardcodedStrings.length + result.dateFormatIssues.length + result.monthArrayIssues.length}`)
}

// Run
const result = runAudit()
generateReport(result)
