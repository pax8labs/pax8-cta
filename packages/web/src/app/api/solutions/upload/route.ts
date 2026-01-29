import { NextRequest, NextResponse } from "next/server";
import { demoCustomAgents, CustomAgent, AgentUrlTemplates } from "@/lib/demo-store";
import JSZip from "jszip";
import { UrlTemplater } from "@agentsync/core";

const DEMO_MODE = process.env.DEMO_MODE === "true" || process.env.NEXT_PUBLIC_DEMO_MODE === "true";

interface ConnectionReference {
  name: string;
  connectorId: string;
  displayName?: string;
}

interface SolutionComponent {
  type: string;
  name: string;
  id?: string;
}

interface TenantSpecificValue {
  type: 'sharepoint_url' | 'dataverse_url' | 'custom_url' | 'environment_variable';
  value: string;
  location: string; // file path where found
  description?: string;
}

interface SolutionMetadata {
  uniqueName: string;
  friendlyName: string;
  version: string;
  publisherName: string;
  isManaged: boolean;
  description?: string;
  connectionReferences: ConnectionReference[];
  components: SolutionComponent[];
  knowledgeSources: string[];
  tenantSpecificValues: TenantSpecificValue[];
}

/**
 * Parse solution zip to extract metadata, connection references, and components
 */
async function parseSolutionZip(zipBuffer: ArrayBuffer): Promise<SolutionMetadata> {
  const zip = await JSZip.loadAsync(zipBuffer);

  // Look for solution.xml in the root of the zip
  const solutionXmlFile = zip.file("solution.xml");
  if (!solutionXmlFile) {
    throw new Error("Invalid solution package: solution.xml not found");
  }

  const solutionXmlContent = await solutionXmlFile.async("text");

  // Parse the XML (simple regex parsing since we don't need a full XML parser for this)
  const getTag = (xml: string, tag: string): string | undefined => {
    const regex = new RegExp(`<${tag}>([^<]*)</${tag}>`, "i");
    const match = xml.match(regex);
    return match ? match[1].trim() : undefined;
  };

  // Extract required fields
  const uniqueName = getTag(solutionXmlContent, "UniqueName");
  if (!uniqueName) {
    throw new Error("Invalid solution.xml: UniqueName not found");
  }

  // LocalizedNames contains the friendly name
  const friendlyNameMatch = solutionXmlContent.match(/<LocalizedName[^>]*description="([^"]*)"[^>]*languagecode="1033"/i)
    || solutionXmlContent.match(/<LocalizedName[^>]*languagecode="1033"[^>]*description="([^"]*)"/i);
  const friendlyName = friendlyNameMatch ? friendlyNameMatch[1] : uniqueName;

  const version = getTag(solutionXmlContent, "Version") || "1.0.0.0";

  // Get managed status (0 = unmanaged, 1 = managed)
  const managedValue = getTag(solutionXmlContent, "Managed");
  const isManaged = managedValue === "1" || managedValue === "2";

  // Publisher info
  const publisherMatch = solutionXmlContent.match(/<Publisher>[\s\S]*?<UniqueName>([^<]*)<\/UniqueName>[\s\S]*?<\/Publisher>/i);
  const publisherName = publisherMatch ? publisherMatch[1] : "Unknown";

  // Description (optional)
  const descriptionMatch = solutionXmlContent.match(/<Descriptions>[\s\S]*?<Description[^>]*description="([^"]*)"[^>]*languagecode="1033"/i);
  const description = descriptionMatch ? descriptionMatch[1] : undefined;

  // Extract connection references from connectionreferences folder
  const connectionReferences: ConnectionReference[] = [];
  const connectionRefFiles = zip.file(/connectionreferences\/.*\.json$/i);
  for (const file of connectionRefFiles) {
    try {
      const content = await file.async("text");
      const data = JSON.parse(content);
      if (data.connectionreferencelogicalname || data.connectorid) {
        connectionReferences.push({
          name: data.connectionreferencelogicalname || data.schemaname || file.name,
          connectorId: data.connectorid || "",
          displayName: data.connectionreferencedisplayname || undefined,
        });
      }
    } catch {
      // Skip invalid files
    }
  }

  // Also check for connection references in customizations.xml
  const customizationsFile = zip.file("customizations.xml");
  if (customizationsFile) {
    const customizationsContent = await customizationsFile.async("text");
    // Look for connectionreference elements
    const connRefMatches = customizationsContent.matchAll(/<connectionreference[^>]*connectionreferencelogicalname="([^"]*)"[^>]*connectorid="([^"]*)"/gi);
    for (const match of connRefMatches) {
      if (!connectionReferences.find(cr => cr.name === match[1])) {
        connectionReferences.push({
          name: match[1],
          connectorId: match[2],
        });
      }
    }
  }

  // Extract components/entities from solution
  const components: SolutionComponent[] = [];
  const knowledgeSources: string[] = [];
  const tenantSpecificValues: TenantSpecificValue[] = [];

  // Regex patterns for tenant-specific URLs
  const sharepointUrlPattern = /https?:\/\/[a-zA-Z0-9-]+\.sharepoint\.com[^\s"'<>]*/gi;
  const dynamicsUrlPattern = /https?:\/\/[a-zA-Z0-9-]+\.crm[0-9]*\.dynamics\.com[^\s"'<>]*/gi;

  // First, scan folder names for knowledge source indicators
  // Copilot Studio uses folder names like: agent.knowledge.SharePointSearchSource.0
  const allFileNames = Object.keys(zip.files);
  for (const fileName of allFileNames) {
    const fileNameLower = fileName.toLowerCase();
    if (fileNameLower.includes('.knowledge.')) {
      if (fileNameLower.includes('sharepoint')) {
        knowledgeSources.push('SharePoint');
      }
      if (fileNameLower.includes('dataverse')) {
        knowledgeSources.push('Dataverse');
      }
      if (fileNameLower.includes('website') || fileNameLower.includes('publicweb')) {
        knowledgeSources.push('Website');
      }
      if (fileNameLower.includes('file') || fileNameLower.includes('document')) {
        knowledgeSources.push('Uploaded Files');
      }
    }
  }

  // Scan data files (YAML-like format used by Copilot Studio)
  const dataFiles = zip.file(/\/data$/i);
  for (const file of dataFiles) {
    try {
      const content = await file.async("text");
      const contentLower = content.toLowerCase();
      if (contentLower.includes('sharepointsearchsource') || contentLower.includes('sharepoint')) {
        knowledgeSources.push('SharePoint');
      }
      if (contentLower.includes('dataversesource') || contentLower.includes('dataverse')) {
        knowledgeSources.push('Dataverse');
      }
      if (contentLower.includes('websitesource') || contentLower.includes('publicwebsite')) {
        knowledgeSources.push('Website');
      }

      // Extract tenant-specific SharePoint URLs
      const spMatches = content.match(sharepointUrlPattern);
      if (spMatches) {
        for (const url of spMatches) {
          // Clean up the URL (remove trailing punctuation)
          const cleanUrl = url.replace(/[,;:'")\]}>]+$/, '');
          if (!tenantSpecificValues.find(v => v.value === cleanUrl)) {
            tenantSpecificValues.push({
              type: 'sharepoint_url',
              value: cleanUrl,
              location: file.name,
              description: 'SharePoint site URL - must be configured per tenant',
            });
          }
        }
      }

      // Extract tenant-specific Dynamics URLs
      const dynMatches = content.match(dynamicsUrlPattern);
      if (dynMatches) {
        for (const url of dynMatches) {
          const cleanUrl = url.replace(/[,;:'")\]}>]+$/, '');
          if (!tenantSpecificValues.find(v => v.value === cleanUrl)) {
            tenantSpecificValues.push({
              type: 'dataverse_url',
              value: cleanUrl,
              location: file.name,
              description: 'Dataverse environment URL - must be configured per tenant',
            });
          }
        }
      }
    } catch {
      // Skip
    }
  }

  // Look for bot components and knowledge sources
  // Check ALL json files in the solution, not just botcomponents folder
  const allJsonFiles = zip.file(/\.json$/i);
  for (const file of allJsonFiles) {
    try {
      const content = await file.async("text");

      // Scan the raw content for data source indicators
      const contentLower = content.toLowerCase();

      // SharePoint indicators
      if (contentLower.includes('sharepoint') ||
          contentLower.includes('sharepointsites') ||
          contentLower.includes('sharepointdocumentlocation') ||
          contentLower.includes('/sites/') ||
          contentLower.includes('.sharepoint.com')) {
        knowledgeSources.push('SharePoint');
      }

      // Dataverse indicators
      if (contentLower.includes('dataverse') ||
          contentLower.includes('crm.dynamics.com') ||
          contentLower.includes('entitysetname')) {
        knowledgeSources.push('Dataverse');
      }

      // Website/URL indicators
      if (contentLower.includes('publicwebsite') ||
          contentLower.includes('websiteurl') ||
          contentLower.includes('"type":"website"') ||
          contentLower.includes('"type": "website"')) {
        knowledgeSources.push('Website');
      }

      // File upload indicators
      if (contentLower.includes('uploadedfiles') ||
          contentLower.includes('documentknowledge') ||
          contentLower.includes('"type":"files"') ||
          contentLower.includes('"type": "files"')) {
        knowledgeSources.push('Uploaded Files');
      }

      // Try to parse as JSON for component info
      if (file.name.includes('botcomponent') || file.name.includes('agentcomponent')) {
        const data = JSON.parse(content);
        components.push({
          type: data.componenttype || data['@odata.type'] || 'component',
          name: data.name || data.schemaname || data.displayname || file.name.split('/').pop() || file.name,
          id: data.botcomponentid || data.agentcomponentid,
        });
      }
    } catch {
      // Skip files that can't be parsed
    }
  }

  // Scan ALL XML files for data sources (botcomponent.xml files contain knowledge source info)
  const xmlFiles = zip.file(/\.xml$/i);
  for (const file of xmlFiles) {
    if (file.name === 'solution.xml' || file.name === '[Content_Types].xml') continue;
    try {
      const content = await file.async("text");
      const contentLower = content.toLowerCase();

      // Check for SharePoint references
      if (contentLower.includes('sharepoint') ||
          contentLower.includes('.sharepoint.com') ||
          contentLower.includes('sharepointsearchsource')) {
        knowledgeSources.push('SharePoint');
      }
      // Check for Dataverse references
      if (contentLower.includes('dataverse') ||
          contentLower.includes('crm.dynamics.com') ||
          contentLower.includes('dataversesource')) {
        knowledgeSources.push('Dataverse');
      }
      // Check for website references
      if (contentLower.includes('websitesource') ||
          contentLower.includes('publicwebsite')) {
        knowledgeSources.push('Website');
      }

      // Extract component info from botcomponent.xml files
      if (file.name.endsWith('botcomponent.xml')) {
        // Parse component type and name
        const nameMatch = content.match(/<name>([^<]*)<\/name>/i);
        const typeMatch = content.match(/<componenttype>([^<]*)<\/componenttype>/i);
        const schemaMatch = content.match(/schemaname="([^"]*)"/i);
        if (schemaMatch) {
          components.push({
            type: typeMatch ? `type-${typeMatch[1]}` : 'botcomponent',
            name: nameMatch ? nameMatch[1] : schemaMatch[1],
            id: schemaMatch[1],
          });
        }
      }

      // Extract tenant-specific URLs from XML files
      const spMatches = content.match(sharepointUrlPattern);
      if (spMatches) {
        for (const url of spMatches) {
          const cleanUrl = url.replace(/[,;:'")\]}>]+$/, '');
          if (!tenantSpecificValues.find(v => v.value === cleanUrl)) {
            tenantSpecificValues.push({
              type: 'sharepoint_url',
              value: cleanUrl,
              location: file.name,
              description: 'SharePoint site URL - must be configured per tenant',
            });
          }
        }
      }

      const dynMatches = content.match(dynamicsUrlPattern);
      if (dynMatches) {
        for (const url of dynMatches) {
          const cleanUrl = url.replace(/[,;:'")\]}>]+$/, '');
          if (!tenantSpecificValues.find(v => v.value === cleanUrl)) {
            tenantSpecificValues.push({
              type: 'dataverse_url',
              value: cleanUrl,
              location: file.name,
              description: 'Dataverse environment URL - must be configured per tenant',
            });
          }
        }
      }
    } catch {
      // Skip
    }
  }

  // Check for Copilot knowledge configuration in other places
  const allFiles = Object.keys(zip.files);
  for (const fileName of allFiles) {
    if (fileName.includes('knowledge') || fileName.includes('datasource')) {
      const file = zip.file(fileName);
      if (file && !file.dir) {
        try {
          const content = await file.async("text");
          if (content.includes('sharepoint') || content.includes('SharePoint')) {
            if (!knowledgeSources.includes('SharePoint')) {
              knowledgeSources.push('SharePoint');
            }
          }
        } catch {
          // Skip
        }
      }
    }
  }

  // Dedupe knowledge sources
  const uniqueKnowledgeSources = [...new Set(knowledgeSources)];

  return {
    uniqueName,
    friendlyName,
    version,
    publisherName,
    isManaged,
    description,
    connectionReferences,
    components,
    knowledgeSources: uniqueKnowledgeSources,
    tenantSpecificValues,
  };
}

/**
 * POST /api/solutions/upload
 *
 * Upload a Power Platform solution zip file
 *
 * Body: FormData with 'file' field containing the .zip file
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "Missing required 'file' in form data" },
        { status: 400 }
      );
    }

    // Validate file type
    if (!file.name.endsWith(".zip")) {
      return NextResponse.json(
        { error: "File must be a .zip file" },
        { status: 400 }
      );
    }

    // Read file contents
    const arrayBuffer = await file.arrayBuffer();

    // Parse solution zip to extract metadata
    const metadata = await parseSolutionZip(arrayBuffer);

    // Use URL templater to detect tenant-specific URLs and generate templates
    const urlTemplater = new UrlTemplater();
    const zip = await JSZip.loadAsync(arrayBuffer);
    const detectedUrls = await urlTemplater.scanSolution(zip);
    const urlTemplates = urlTemplater.createAgentUrlTemplates(detectedUrls);

    // Store solution as base64 for later deploy-time modification
    const solutionBase64 = Buffer.from(arrayBuffer).toString('base64');

    // In demo mode or real mode, add to the custom agents store
    const newAgent: CustomAgent = {
      id: metadata.uniqueName,
      uniqueName: metadata.uniqueName,
      friendlyName: metadata.friendlyName,
      version: metadata.version,
      description: metadata.description,
      publisherName: metadata.publisherName,
      isManaged: metadata.isManaged,
      status: 'active',
      createdAt: new Date().toISOString(),
      urlTemplates: urlTemplates || undefined,
      solutionBase64,
    };

    // Check if agent already exists
    if (demoCustomAgents.has(metadata.uniqueName)) {
      // Update existing agent
      const existing = demoCustomAgents.get(metadata.uniqueName)!;
      newAgent.createdAt = existing.createdAt; // Preserve original creation date
      newAgent.status = existing.status; // Preserve existing status
    }

    demoCustomAgents.set(metadata.uniqueName, newAgent);

    return NextResponse.json({
      success: true,
      agent: newAgent,
      metadata,
      urlTemplates,
      demoMode: DEMO_MODE,
    });
  } catch (error) {
    console.error("Error uploading solution:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to process solution file",
      },
      { status: 500 }
    );
  }
}
