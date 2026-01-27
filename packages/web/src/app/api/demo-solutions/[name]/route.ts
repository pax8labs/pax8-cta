import { NextRequest, NextResponse } from 'next/server'
import { DEMO_SOLUTIONS } from '@agentsync/core'
import { demoCustomAgents } from '@/lib/demo-store'
import JSZip from 'jszip'

export const dynamic = 'force-dynamic'

/**
 * Generate and download a demo solution zip file
 * Creates a mock Copilot Studio solution package on-the-fly
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params

  // Define a minimal solution type for what we need
  type SolutionInfo = {
    uniqueName: string
    friendlyName: string
    version: string
    description: string
    publisherName: string
    isManaged: boolean
  }

  // Find the requested solution in built-in demos first
  let solution: SolutionInfo | undefined = DEMO_SOLUTIONS.find(s => s.uniqueName === name)

  // If not found, check custom imported agents
  if (!solution) {
    const customAgent = demoCustomAgents.get(name)
    if (customAgent) {
      solution = {
        uniqueName: customAgent.uniqueName,
        friendlyName: customAgent.friendlyName,
        version: customAgent.version,
        description: customAgent.description || 'Imported agent',
        publisherName: customAgent.publisherName || 'Imported',
        isManaged: customAgent.isManaged,
      }
    }
  }

  if (!solution) {
    return NextResponse.json(
      { error: `Solution "${name}" not found` },
      { status: 404 }
    )
  }

  // Create a mock solution zip file
  const zip = new JSZip()

  // Add solution.xml (required by Power Platform)
  const solutionXml = `<?xml version="1.0" encoding="utf-8"?>
<ImportExportXml xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <SolutionManifest>
    <UniqueName>${solution.uniqueName}</UniqueName>
    <LocalizedNames>
      <LocalizedName description="${solution.friendlyName}" languagecode="1033" />
    </LocalizedNames>
    <Descriptions>
      <Description description="${solution.description}" languagecode="1033" />
    </Descriptions>
    <Version>${solution.version}</Version>
    <Managed>${solution.isManaged ? '1' : '0'}</Managed>
    <Publisher>
      <UniqueName>contosoISV</UniqueName>
      <LocalizedNames>
        <LocalizedName description="${solution.publisherName}" languagecode="1033" />
      </LocalizedNames>
    </Publisher>
    <RootComponents>
      <RootComponent type="10102" behavior="0" />
    </RootComponents>
  </SolutionManifest>
</ImportExportXml>`

  zip.file('solution.xml', solutionXml)

  // Add [Content_Types].xml (required for solution packages)
  const contentTypesXml = `<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/xml" />
  <Default Extension="json" ContentType="application/json" />
</Types>`

  zip.file('[Content_Types].xml', contentTypesXml)

  // Add a customizations.xml placeholder
  const customizationsXml = `<?xml version="1.0" encoding="utf-8"?>
<ImportExportXml xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <Entities />
  <Workflows />
  <FieldSecurityProfiles />
  <Templates />
  <EntityRelationships />
  <OrganizationSettings />
  <optionsets />
  <CustomControls />
  <EntityMaps />
  <EntityDataProviders />
</ImportExportXml>`

  zip.file('customizations.xml', customizationsXml)

  // Add a mock bot definition (Copilot Studio specific)
  const botDefinition = {
    schemaVersion: '1.2',
    name: solution.friendlyName,
    description: solution.description,
    language: 'en-us',
    topics: [
      {
        id: 'greeting',
        name: 'Greeting',
        triggerPhrases: ['hello', 'hi', 'hey'],
      },
      {
        id: 'fallback',
        name: 'Fallback',
        triggerPhrases: [],
      },
    ],
    variables: [],
    entities: [],
  }

  zip.file('bot/botdefinition.json', JSON.stringify(botDefinition, null, 2))

  // Generate the zip buffer
  const zipBuffer = await zip.generateAsync({
    type: 'arraybuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  })

  // Return the zip file
  const filename = `${solution.uniqueName}_${solution.version.replace(/\./g, '_')}_managed.zip`

  return new NextResponse(zipBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': zipBuffer.byteLength.toString(),
    },
  })
}
