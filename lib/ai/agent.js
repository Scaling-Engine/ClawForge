import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { SystemMessage } from '@langchain/core/messages';
import { createModel } from './model.js';
import { createJobTool, getJobStatusTool, getSystemTechnicalSpecsTool, createInstanceJobTool, getProjectStateTool, startCodingTool, listWorkspacesTool, cancelJobTool, createClusterJobTool } from './tools.js';
import { webSearchTool } from './web-search.js';
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite';
import { eventHandlerMd, clawforgeDb } from '../paths.js';
import { render_md } from '../utils/render-md.js';

let _agent = null;

/**
 * Get or create the LangGraph agent singleton.
 * Uses createReactAgent which handles the tool loop automatically.
 * Prompt is a function so {{datetime}} resolves fresh each invocation.
 */
export async function getAgent() {
  if (!_agent) {
    const model = await createModel();
    const tools = [createJobTool, getJobStatusTool, getSystemTechnicalSpecsTool, createInstanceJobTool, getProjectStateTool, startCodingTool, listWorkspacesTool, cancelJobTool, createClusterJobTool, ...(process.env.BRAVE_API_KEY ? [webSearchTool] : [])];
    const checkpointer = SqliteSaver.fromConnString(clawforgeDb);

    _agent = createReactAgent({
      llm: model,
      tools,
      checkpointSaver: checkpointer,
      prompt: (state) => [new SystemMessage(render_md(eventHandlerMd)), ...state.messages],
    });
  }
  return _agent;
}

/**
 * Reset the agent singleton (e.g., when config changes).
 */
export function resetAgent() {
  _agent = null;
}
