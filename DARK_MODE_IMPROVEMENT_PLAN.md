# Dark Mode Improvement Plan

## Executive Summary

After comprehensive audit of the codebase, dark mode has **inconsistent implementation** across pages:
- ✅ Good: Dashboard (91% coverage), Agents (91% coverage), Settings (91% coverage), Welcome (95% coverage)
- ❌ Poor: **Deployments** (0.3% coverage), **Tenants** (0.9% coverage)

**Critical Issues:**
1. Flash of white content on page load
2. White boxes/cards in dark mode on tenants and deployments pages
3. Inconsistent dark mode support across components
4. Potential contrast/accessibility issues

---

## Phase 1: Fix Flash on Load (Issue #35) 🔴 CRITICAL

### Problem
Theme is loaded asynchronously from `/api/settings` after React mounts, causing a visible flash of light mode before dark mode applies.

### Root Cause
```typescript
// theme-provider.tsx:54-71
useEffect(() => {
  const loadTheme = async () => {
    const response = await fetch('/api/settings')  // ← Async API call
    // ...
    setMounted(true)
  }
  loadTheme()
}, [])
```

The `dark` class is only added after:
1. React mounts
2. API call completes
3. Theme is resolved

### Solutions

#### Option A: Inline Script (Recommended)
Add a blocking script in `<head>` that reads theme from localStorage and applies it immediately:

```tsx
// layout.tsx
<html lang="en">
  <head>
    <script dangerouslySetInnerHTML={{
      __html: `
        (function() {
          try {
            const theme = localStorage.getItem('theme') || 'system';
            if (theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
              document.documentElement.classList.add('dark');
            }
          } catch {}
        })();
      `
    }} />
  </head>
  <body>...</body>
</html>
```

**Pros:**
- No flash - executes before first paint
- Works even without JavaScript enabled
- Standard approach used by shadcn/ui, next-themes

**Cons:**
- Requires localStorage sync with settings API

#### Option B: Server-Side Theme Detection
Use cookies to pass theme to server for SSR.

**Pros:**
- True SSR with correct theme

**Cons:**
- More complex
- Requires cookie middleware
- Adds latency to every request

**Recommendation:** Implement Option A

---

## Phase 2: Fix White Boxes on Tenants Page (Issue #36) 🔴 CRITICAL

### Current State
**File:** `/packages/web/src/app/tenants/page.tsx`
- **Total lines:** 571
- **Dark mode classes:** 5 (0.9% coverage)
- **White backgrounds:** 12+

### Missing Dark Mode Elements

#### 1. Filter Pills (Lines 161-175)
```tsx
// BEFORE:
<div className="bg-white border border-slate-200 rounded-lg px-4 py-2 shadow-sm">

// AFTER:
<div className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg px-4 py-2 shadow-sm">
```

#### 2. Quick Stats Code Block (Line 175)
```tsx
// BEFORE:
<code className="text-sm text-slate-600 bg-white px-3 py-1.5 rounded border border-slate-200 font-mono">

// AFTER:
<code className="text-sm text-slate-600 dark:text-slate-300 bg-white dark:bg-gray-800 px-3 py-1.5 rounded border border-slate-200 dark:border-gray-700 font-mono">
```

#### 3. Dropdown Buttons (Line 206)
```tsx
// BEFORE:
className="px-3 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 bg-white hover:border-slate-300"

// AFTER:
className="px-3 py-2 rounded-lg border border-slate-200 dark:border-gray-700 text-sm font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-gray-800 hover:border-slate-300 dark:hover:border-gray-600"
```

#### 4. Status Pills (Line 229)
```tsx
// BEFORE:
? 'bg-blue-100 text-blue-700'

// AFTER:
? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
```

#### 5. Modal Backgrounds (Line 501)
```tsx
// BEFORE:
<div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">

// AFTER:
<div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full mx-4 overflow-hidden border dark:border-gray-700">
```

### Action Items
- [ ] Add dark: variants to all background colors
- [ ] Add dark: variants to all text colors
- [ ] Add dark: variants to all border colors
- [ ] Test visual contrast in dark mode
- [ ] Ensure hover states work in dark mode

---

## Phase 3: Fix Deployments Page (Issue #36) 🔴 CRITICAL

### Current State
**File:** `/packages/web/src/app/deployments/page.tsx`
- **Total lines:** 1,445
- **Dark mode classes:** 5 (0.3% coverage)
- **White backgrounds:** 10+

This is the **worst** dark mode coverage in the app.

### High-Impact Areas

#### 1. Deployment Batch Cards (Lines 1164-1250)
Large card components showing deployment status - highly visible white boxes.

```tsx
// BEFORE:
<div className="bg-white rounded-lg border border-gray-200 overflow-hidden">

// AFTER:
<div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
```

#### 2. Tenant Tables (Lines 1286-1409)
Table rows and cells need dark mode support.

```tsx
// BEFORE:
<table className="min-w-full divide-y divide-gray-200">
  <thead className="bg-gray-50">

// AFTER:
<table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
  <thead className="bg-gray-50 dark:bg-gray-900">
```

#### 3. Retry Progress Modal (Lines 486-678)
Terminal-style modal - should use dark theme.

```tsx
// Already has dark styling (slate-900 bg) - verify contrast
```

#### 4. Status Badges (Lines 87-133)
Colored badges need dark mode variants.

```tsx
// BEFORE:
completed: { bg: 'bg-emerald-50', text: 'text-emerald-700', ... }

// AFTER:
completed: { bg: 'bg-emerald-50 dark:bg-emerald-900', text: 'text-emerald-700 dark:text-emerald-300', ... }
```

### Action Items
- [ ] Batch cards (highest priority - most visible)
- [ ] Table styling
- [ ] Status badge variants
- [ ] Filter buttons and dropdowns
- [ ] Empty states
- [ ] Error message containers

---

## Phase 4: Fix Component Library 🟠 HIGH

### Components Needing Dark Mode

1. **DeploymentCard** - Used in dashboard
2. **StatsCard** - Used in dashboard
3. **UserMenu** - Navigation component
4. **SetupWizard** - Onboarding flow
5. **AgentCard** - Agent listing component
6. **AgentUploadModal** - File upload modal
7. **SolutionPreview** - Preview panel
8. **ConflictResolutionPanel** - Conflict UI
9. **TagEditor** - Tag management
10. **DeploymentProgress** - Progress tracking
11. **LiveTenantCard** - Real-time status
12. **CompactTenantRow** - Table rows

### Audit Approach
For each component:
1. Find all instances of `bg-`, `text-`, `border-`
2. Add corresponding `dark:` variants
3. Test in dark mode
4. Check hover/focus states

---

## Phase 5: Improve Color Contrast (Issue #34) 🟡 MEDIUM

### Accessibility Standards
- WCAG 2.1 Level AA requires 4.5:1 contrast for normal text
- 3:1 for large text (18pt+ or 14pt+ bold)

### Current Issues

#### 1. Gray Text on Gray Background
```tsx
// Potentially low contrast:
text-slate-600 dark:text-slate-400  // on dark:bg-gray-800
```

**Solution:** Use lighter shades in dark mode:
```tsx
text-slate-600 dark:text-slate-300  // Better contrast
```

#### 2. Status Colors
Current status colors may not have sufficient contrast in dark mode:
- `bg-emerald-50 text-emerald-700` → `dark:bg-emerald-900 dark:text-emerald-300`
- `bg-blue-50 text-blue-700` → `dark:bg-blue-900 dark:text-blue-300`
- `bg-rose-50 text-rose-700` → `dark:bg-rose-900 dark:text-rose-300`

#### 3. Border Visibility
Borders using `border-gray-200` may be too subtle in dark mode.

**Solution:**
```tsx
border-gray-200 dark:border-gray-700  // More visible
```

### Action Items
- [ ] Audit all text/background combinations with contrast checker
- [ ] Update color palette in tailwind.config.js if needed
- [ ] Test with browser accessibility tools
- [ ] Test with actual dark mode users

---

## Phase 6: Systematic Application 🟢 LOW

### Create Dark Mode Standards

#### 1. Color Mapping Table
```
Light Mode         → Dark Mode
-----------------------------------------
bg-white           → dark:bg-gray-800
bg-gray-50         → dark:bg-gray-900
bg-gray-100        → dark:bg-gray-800
text-gray-900      → dark:text-white
text-gray-700      → dark:text-gray-200
text-gray-600      → dark:text-gray-300
text-gray-500      → dark:text-gray-400
border-gray-200    → dark:border-gray-700
border-gray-300    → dark:border-gray-600

Status Colors:
bg-blue-50         → dark:bg-blue-900
text-blue-700      → dark:text-blue-300
bg-emerald-50      → dark:bg-emerald-900
text-emerald-700   → dark:text-emerald-300
bg-rose-50         → dark:bg-rose-900
text-rose-700      → dark:text-rose-300
```

#### 2. Component Checklist
For every new component:
- [ ] All backgrounds have dark: variants
- [ ] All text colors have dark: variants
- [ ] All borders have dark: variants
- [ ] Hover states work in dark mode
- [ ] Focus states work in dark mode
- [ ] Disabled states work in dark mode
- [ ] Contrast ratio meets WCAG AA

#### 3. Code Review Checklist
- [ ] No standalone `bg-white` without `dark:bg-gray-800`
- [ ] No standalone `text-gray-900` without `dark:text-white`
- [ ] No standalone `border-gray-200` without `dark:border-gray-700`

---

## Implementation Order (Recommended)

### Sprint 1: Critical Fixes (1-2 hours)
1. ✅ **Fix flash on load** - Add inline script (5 min)
2. ✅ **Fix tenants page** - Add dark: variants (30 min)
3. ✅ **Fix deployments page batch cards** - Most visible issue (30 min)

### Sprint 2: Complete Deployments Page (2-3 hours)
4. ✅ Fix deployment tables
5. ✅ Fix status badges
6. ✅ Fix filters and buttons
7. ✅ Test entire deployments flow

### Sprint 3: Component Library (3-4 hours)
8. ✅ Audit and fix all shared components
9. ✅ Create dark mode documentation
10. ✅ Add to component guidelines

### Sprint 4: Polish & Accessibility (2-3 hours)
11. ✅ Contrast audit with tools
12. ✅ User testing in dark mode
13. ✅ Fix any remaining issues
14. ✅ Close issues #34, #35, #36

---

## Testing Checklist

### Manual Testing
- [ ] Toggle dark mode on/off - no flash
- [ ] Refresh page in dark mode - stays dark
- [ ] Navigate between pages - consistent theme
- [ ] Check all pages: dashboard, deployments, tenants, agents, settings, welcome
- [ ] Test modals and dropdowns
- [ ] Test form inputs
- [ ] Test buttons (all states: default, hover, active, disabled)
- [ ] Test status badges
- [ ] Test error states
- [ ] Test loading states

### Automated Testing
- [ ] Add contrast ratio checks to CI
- [ ] Screenshot testing in dark mode
- [ ] Visual regression tests

### Browser Testing
- [ ] Chrome (light & dark)
- [ ] Firefox (light & dark)
- [ ] Safari (light & dark)
- [ ] Edge (light & dark)

### Accessibility Testing
- [ ] Run Lighthouse accessibility audit
- [ ] Test with screen reader
- [ ] Test with high contrast mode
- [ ] Test keyboard navigation

---

## Success Metrics

### Before
- 2 pages with <1% dark mode coverage
- Flash on every page load
- Multiple user complaints
- Inconsistent experience

### After
- 100% dark mode coverage on all pages
- Zero flash on page load
- Consistent dark mode experience
- WCAG AA compliant contrast ratios
- Issues #34, #35, #36 closed

---

## Long-Term Recommendations

1. **Add ESLint Rule:** Warn when using `bg-white`, `text-gray-900`, etc. without dark: variant
2. **Component Library:** Document dark mode requirements
3. **Storybook:** Add dark mode toggle to all component stories
4. **CI/CD:** Add visual regression testing for dark mode
5. **Design System:** Create comprehensive dark mode color palette

---

## Files to Modify

### Priority 1 (Critical)
- ✅ `/packages/web/src/app/layout.tsx` - Add inline script
- ✅ `/packages/web/src/app/tenants/page.tsx` - Add dark: variants throughout
- ✅ `/packages/web/src/app/deployments/page.tsx` - Add dark: variants throughout

### Priority 2 (High)
- ✅ All components in `/packages/web/src/components/`
- ✅ `/packages/web/src/components/providers/theme-provider.tsx` - Add localStorage sync

### Priority 3 (Medium)
- ✅ `/packages/web/tailwind.config.js` - Document color system
- ✅ Create dark mode style guide
- ✅ Update component documentation

---

## Related Issues
- #34 - Dark mode contrast makes numbers hard to read
- #35 - Dark mode flashes white when loading new pages
- #36 - Dark mode has very white boxes on some pages e.g. /tenants

**Estimated Total Effort:** 8-12 hours
**Priority:** CRITICAL - Affects UX on every page load
