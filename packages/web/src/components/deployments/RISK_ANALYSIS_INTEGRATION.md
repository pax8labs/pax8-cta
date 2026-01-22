# Risk Analysis Integration Guide

## Quick Integration (3 steps)

### 1. Import the Modal Component
```tsx
import { RiskAssessmentModal } from '@/components/deployments/RiskAssessmentModal'
```

### 2. Add State for Modal Control
```tsx
const [showRiskAnalysis, setShowRiskAnalysis] = useState(false)
```

### 3. Add Modal to Your Component
```tsx
<RiskAssessmentModal
  isOpen={showRiskAnalysis}
  onClose={() => setShowRiskAnalysis(false)}
  onProceed={handleActualDeployment}
  tenantIds={selectedTenantIds}
  solutionFile={solutionFileName}
  solutionSize={solutionFileSize}
  isProduction={isProductionDeployment}
/>
```

### 4. Show Modal Before Deployment
```tsx
const handleDeployClick = () => {
  // Instead of deploying directly, show risk analysis first
  setShowRiskAnalysis(true)
}

const handleActualDeployment = async () => {
  // This runs AFTER user reviews risk and clicks "Proceed"
  // Your existing deployment code goes here
  await createDeployment(...)
}
```

---

## Complete Example

```tsx
'use client'

import { useState } from 'react'
import { RiskAssessmentModal } from '@/components/deployments/RiskAssessmentModal'

export function DeploymentForm() {
  const [selectedTenants, setSelectedTenants] = useState<string[]>([])
  const [showRiskAnalysis, setShowRiskAnalysis] = useState(false)

  const handleAnalyzeClick = () => {
    setShowRiskAnalysis(true)
  }

  const handleProceedWithDeployment = async () => {
    // User reviewed risk and clicked "Proceed"
    // Now actually create the deployment

    const response = await fetch('/api/deployments', {
      method: 'POST',
      body: JSON.stringify({
        tenantIds: selectedTenants,
        // ... other deployment params
      }),
    })

    // Handle response...
  }

  return (
    <>
      <form>
        {/* Your form fields */}

        <button
          type="button"
          onClick={handleAnalyzeClick}
          className="bg-blue-600 text-white px-4 py-2 rounded"
        >
          Analyze Risk & Deploy
        </button>
      </form>

      <RiskAssessmentModal
        isOpen={showRiskAnalysis}
        onClose={() => setShowRiskAnalysis(false)}
        onProceed={handleProceedWithDeployment}
        tenantIds={selectedTenants}
        solutionFile="MyAgent.zip"
        solutionSize={5242880}
        isProduction={true}
      />
    </>
  )
}
```

---

## Alternative: Use the Hook Directly

If you need more control, use the `useRiskAnalysis` hook directly:

```tsx
import { useRiskAnalysis } from '@/hooks/useRiskAnalysis'

function MyComponent() {
  const { analysis, loading, error, analyze } = useRiskAnalysis()

  const handleAnalyze = async () => {
    await analyze({
      tenantIds: ['tenant-1', 'tenant-2'],
      isProduction: true,
    })
  }

  return (
    <div>
      <button onClick={handleAnalyze}>Analyze</button>
      {loading && <p>Analyzing...</p>}
      {error && <p>Error: {error.message}</p>}
      {analysis && (
        <div>
          Risk Score: {analysis.score}
          Success Probability: {analysis.successProbability}%
        </div>
      )}
    </div>
  )
}
```

---

## Integration Locations

Risk analysis should be integrated in these places:

### ✅ Recommended
- **Deployment Creation** (`/deployments/new`) - Before submitting form
- **Scheduled Deployments** (`/deployments/schedules`) - When scheduling
- **Wave Orchestration** - Before starting each wave

### ⚠️ Optional
- **Retry Failed Deployments** - Before retrying
- **Dashboard Quick Deploy** - If you add one-click deploy buttons

---

## Props Reference

### RiskAssessmentModal

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `isOpen` | boolean | Yes | Controls modal visibility |
| `onClose` | () => void | Yes | Called when user closes modal |
| `onProceed` | () => void | Yes | Called when user clicks "Proceed" |
| `tenantIds` | string[] | Yes | Array of tenant IDs to analyze |
| `solutionFile` | string | No | Solution filename (for context) |
| `solutionSize` | number | No | Solution size in bytes |
| `isProduction` | boolean | No | Whether this is production deployment (default: false) |

---

## Styling

The component uses Tailwind CSS classes. To customize colors:

1. Edit `RiskAssessment.tsx` - Change `SCORE_CONFIG` and `SEVERITY_CONFIG`
2. Or wrap in a div with custom theme classes

---

## Testing in Demo Mode

In demo mode, the risk analyzer simulates realistic issues:

- **20% of tenants** - Missing GDAP permissions
- **15% chance** - Expired connection references
- **Peak hours** - Warns if deploying 9 AM - 5 PM weekdays
- **Friday PM** - Warns if deploying Friday afternoon
- **Historical data** - Uses real deployment history from database

---

## Future Enhancements

The risk analysis system is designed to be extended:

- [ ] Real GDAP checks via Microsoft Graph API
- [ ] Real connection validation via Dataverse API
- [ ] Machine learning for improved risk scoring
- [ ] Custom risk rules per tenant/agent
- [ ] Risk history tracking
- [ ] Scheduled risk reports

See issue #49 for more details.
