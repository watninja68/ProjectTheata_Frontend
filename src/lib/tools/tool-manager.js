/**
 * Managing class where tools can be registered for easier use
 * Each tool must implement execute() and getDeclaration() methods.
 */

export class ToolManager {
    /**
     * Initializes a new ToolManager instance for getting registering, getting declarations, and executing tools.
     */
    constructor() {
        this.tools = new Map();
    }

    /**
     * Registers a new tool in the tool registry.
     * @param {string} name - Unique identifier for the tool
     * @param {Object} toolInstance - Instance of the tool implementing required interface
     */
    registerTool(name, toolInstance) {
        if (this.tools.has(name)) {
            console.warn(`Tool ${name} is already registered`);
            return;
        }
        this.tools.set(name, toolInstance);
        console.info(`Tool ${name} registered successfully`);
    }

    /**
     * Collects and returns declarations from all registered tools.
     * @returns {Array<Object>} Array of tool declarations for registered tools
     */
    getToolDeclarations() {
        const allDeclarations = [];
        
        this.tools.forEach((tool) => {
            if (tool.getDeclaration) {
                allDeclarations.push(tool.getDeclaration());
            } else {
                console.warn(`Tool ${tool.name} does not have a getDeclaration method`);
            }
        });

        return allDeclarations;
    }

    /**
     * Parses tool arguments and runs execute() method of the requested tool.
     * @param {Object} functionCall - Function call specification from the model.
     * @param {Object|null} user - The authenticated user object, passed from the agent.
     */
    async handleToolCall(functionCall, user = null) {
        const { name, args, id } = functionCall;
        console.info(`Handling tool call: ${name}`, { args, userId: user?.id });

        const tool = this.tools.get(name);
        if (!tool) {
            const errorMsg = `Tool with name '${name}' is not registered.`;
            console.error(errorMsg);
            return {
                output: null,
                id: id,
                error: errorMsg,
            };
        }

        try {
            // Pass both the LLM's arguments and the user context to the tool
            const result = await tool.execute(args, user);
            return {
                output: result,
                id: id,
                error: null
            }

        } catch (error) {
            console.error(`Tool execution failed: ${name}`, error);
            return {
                output: null,
                id: id,
                error: error.message
            };
        }
    }

}
