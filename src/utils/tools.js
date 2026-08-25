import config from "../../config.json" with { type: "json" };

export const toolDefinitions = [
  {
    type: "function",
    function: {
      name: "tavily_search",
      description: "Search the internet for current events, news, or specific information",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "The search query" }
        },
        required: ["query"]
      }
    }
  }
];

export async function runTool(toolCall) {
  const { name, arguments: argsString } = toolCall.function;
  const args = JSON.parse(argsString);

  if (name === "tavily_search") {
    try {
      const response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${config.tavilyApiKey}`
        },
        body: JSON.stringify({
          query: args.query,
          include_answer: "basic",
          search_depth: "advanced"
        })
      });
      const data = await response.json();
      return data.answer;
    } catch (error) {
      return "Search failed";
    }
  }
  return "Tool not defined";
}
