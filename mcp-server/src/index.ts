import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { workoutTools, handleWorkoutTool } from './tools/workout-tools.js';
import { programTools, handleProgramTool } from './tools/program-tools.js';
import { dietTools, handleDietTool } from './tools/diet-tools.js';
import { bodyTools, handleBodyTool } from './tools/body-tools.js';
import { analysisTools, handleAnalysisTool } from './tools/analysis-tools.js';
import { writeTools, handleWriteTool } from './tools/write-tools.js';
import { memoryTools, handleMemoryTool } from './tools/memory-tools.js';

const allTools = [
  ...workoutTools,
  ...programTools,
  ...dietTools,
  ...bodyTools,
  ...analysisTools,
  ...writeTools,
  ...memoryTools,
];

// Map tool name to handler
const workoutToolNames = new Set(workoutTools.map((t) => t.name));
const programToolNames = new Set(programTools.map((t) => t.name));
const dietToolNames = new Set(dietTools.map((t) => t.name));
const bodyToolNames = new Set(bodyTools.map((t) => t.name));
const analysisToolNames = new Set(analysisTools.map((t) => t.name));
const writeToolNames = new Set(writeTools.map((t) => t.name));
const memoryToolNames = new Set(memoryTools.map((t) => t.name));

const server = new Server(
  {
    name: 'fitness-coach',
    version: '2.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: allTools,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const toolArgs = (args ?? {}) as Record<string, unknown>;

  try {
    let result: string;

    if (workoutToolNames.has(name)) {
      result = await handleWorkoutTool(name, toolArgs);
    } else if (programToolNames.has(name)) {
      result = await handleProgramTool(name, toolArgs);
    } else if (dietToolNames.has(name)) {
      result = await handleDietTool(name, toolArgs);
    } else if (bodyToolNames.has(name)) {
      result = await handleBodyTool(name, toolArgs);
    } else if (analysisToolNames.has(name)) {
      result = await handleAnalysisTool(name, toolArgs);
    } else if (writeToolNames.has(name)) {
      result = await handleWriteTool(name, toolArgs);
    } else if (memoryToolNames.has(name)) {
      result = await handleMemoryTool(name, toolArgs);
    } else {
      throw new Error(`Unknown tool: ${name}`);
    }

    return {
      content: [{ type: 'text', text: result }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: message }) }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Server is running - write to stderr so it doesn't interfere with MCP stdio protocol
  process.stderr.write('Fitness Coach MCP Server v2.0 started\n');
}

main().catch((err) => {
  process.stderr.write(`Fatal error: ${err}\n`);
  process.exit(1);
});
