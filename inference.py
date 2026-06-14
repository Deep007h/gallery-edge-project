import os
import logging

# We will import litert_lm dynamically when needed, or at module load time
# and catch ImportError so that it is robust to installation state.
try:
    import litert_lm
    from litert_lm import tools
    LITERT_AVAILABLE = True
except ImportError:
    litert_lm = None
    tools = None
    LITERT_AVAILABLE = False

logger = logging.getLogger("inference")
logger.setLevel(logging.INFO)

class LiteRTInferenceManager:
    def __init__(self):
        self.engine = None
        self.conversation = None
        self.current_model_path = None
        self.current_backend = None

    def is_available(self):
        return LITERT_AVAILABLE

    def load_model(self, model_path, backend_name="cpu"):
        if not LITERT_AVAILABLE:
            raise RuntimeError("LiteRT-LM is not installed or importable.")
            
        if self.current_model_path == model_path and self.current_backend == backend_name and self.engine is not None:
            logger.info(f"Model already loaded: {model_path} with backend {backend_name}")
            return
            
        self.unload_model()
        
        # Determine backend
        backend = litert_lm.Backend.CPU()
        if backend_name.lower() == "gpu":
            backend = litert_lm.Backend.GPU()
        elif backend_name.lower() == "npu":
            backend = litert_lm.Backend.NPU()
            
        logger.info(f"Initializing LiteRT Engine with model {model_path} and backend {backend_name}...")
        self.engine = litert_lm.Engine(model_path, backend=backend)
        self.current_model_path = model_path
        self.current_backend = backend_name

    def unload_model(self):
        if self.conversation is not None:
            try:
                self.conversation.__exit__(None, None, None)
            except Exception as e:
                logger.warning(f"Error exiting conversation: {e}")
            self.conversation = None
            
        if self.engine is not None:
            try:
                self.engine.__exit__(None, None, None)
            except Exception as e:
                logger.warning(f"Error exiting engine: {e}")
            self.engine = None
            
        self.current_model_path = None
        self.current_backend = None
        logger.info("LiteRT Engine unloaded.")

    def start_chat(self, tools_list=None, sampler_params=None):
        if self.engine is None:
            raise ValueError("No model is loaded. Please load a model first.")
            
        if self.conversation is not None:
            try:
                self.conversation.__exit__(None, None, None)
            except Exception:
                pass
            self.conversation = None
            
        # Parse sampler configuration
        sampler_config = None
        if sampler_params:
            try:
                sampler_config = litert_lm.SamplerConfig(
                    top_k=int(sampler_params.get("topK", 40)),
                    top_p=float(sampler_params.get("topP", 0.95)),
                    temperature=float(sampler_params.get("temperature", 0.8))
                )
            except Exception as e:
                logger.warning(f"Failed to create SamplerConfig: {e}. Using defaults.")
                
        logger.info(f"Starting chat conversation with tools: {[t.__name__ for t in tools_list] if tools_list else None}")
        self.conversation = self.engine.create_conversation(
            sampler_config=sampler_config,
            tools=tools_list
        )

    def generate(self, prompt):
        if self.conversation is None:
            raise ValueError("Chat session is not active. Call start_chat first.")
            
        # Generator for streaming response
        try:
            for chunk in self.conversation.send_message_async(prompt):
                if chunk and "content" in chunk and len(chunk["content"]) > 0:
                    text_content = chunk["content"][0].get("text", "")
                    yield {
                        "type": "text",
                        "text": text_content
                    }
        except Exception as e:
            logger.error(f"Error during stream generation: {e}")
            yield {
                "type": "error",
                "message": str(e)
            }


# Builder helpers for tool sets
def build_mobile_actions_tools(on_action_triggered):
    """
    Creates the ToolSet for Mobile Actions.
    on_action_triggered is a callback function(action_name, parameters)
    """
    if not LITERT_AVAILABLE:
        return []
        
    def turnOnFlashlight() -> str:
        """Turns the flashlight on."""
        logger.info("Tool turnOnFlashlight called")
        on_action_triggered("turnOnFlashlight", {})
        return "success"

    def turnOffFlashlight() -> str:
        """Turns the flashlight off."""
        logger.info("Tool turnOffFlashlight called")
        on_action_triggered("turnOffFlashlight", {})
        return "success"

    def createContact(firstName: str, lastName: str, phoneNumber: str, email: str) -> str:
        """Creates a contact in the phone's contact list."""
        logger.info(f"Tool createContact called: {firstName} {lastName}")
        params = {
            "firstName": firstName,
            "lastName": lastName,
            "phoneNumber": phoneNumber,
            "email": email
        }
        on_action_triggered("createContact", params)
        return f"Successfully created contact for {firstName} {lastName}."

    def sendEmail(to: str, subject: str, body: str) -> str:
        """Sends an email to a contact."""
        logger.info(f"Tool sendEmail called: to={to}")
        params = {
            "to": to,
            "subject": subject,
            "body": body
        }
        on_action_triggered("sendEmail", params)
        return f"Successfully sent email to {to}."

    def showLocationOnMap(location: str) -> str:
        """Shows a location on the map."""
        logger.info(f"Tool showLocationOnMap called: {location}")
        params = {"location": location}
        on_action_triggered("showLocationOnMap", params)
        return f"Location '{location}' displayed on map."

    def openWifiSettings() -> str:
        """Opens the WiFi settings."""
        logger.info("Tool openWifiSettings called")
        on_action_triggered("openWifiSettings", {})
        return "WiFi settings menu opened."

    def createCalendarEvent(datetime: str, title: str) -> str:
        """Creates a new calendar event."""
        logger.info(f"Tool createCalendarEvent called: '{title}' at {datetime}")
        params = {
            "datetime": datetime,
            "title": title
        }
        on_action_triggered("createCalendarEvent", params)
        return f"Calendar event '{title}' scheduled for {datetime}."

    return [
        litert_lm.tool_from_function(turnOnFlashlight),
        litert_lm.tool_from_function(turnOffFlashlight),
        litert_lm.tool_from_function(createContact),
        litert_lm.tool_from_function(sendEmail),
        litert_lm.tool_from_function(showLocationOnMap),
        litert_lm.tool_from_function(openWifiSettings),
        litert_lm.tool_from_function(createCalendarEvent)
    ]


def build_tiny_garden_tools(on_action_triggered):
    """
    Creates the ToolSet for Tiny Garden.
    on_action_triggered is a callback function(action_name, parameters)
    """
    if not LITERT_AVAILABLE:
        return []
        
    def waterPlots(plots: list[int]) -> str:
        """Water one or more garden plots.
        
        Args:
            plots: The list of integer IDs (1 to 9) representing the plots to water.
        """
        logger.info(f"Tool waterPlots called: {plots}")
        on_action_triggered("waterPlots", {"plots": plots})
        return f"Watered plots: {plots}"

    def plantSeed(seed: str, plots: list[int]) -> str:
        """Plant a seed in one or more garden plots.
        
        Args:
            seed: The name of the seed to plant. Must be one of: 'sunflower', 'daisy', 'rose', or 'special'.
            plots: The list of integer IDs (1 to 9) representing the plots to plant.
        """
        logger.info(f"Tool plantSeed called: seed={seed}, plots={plots}")
        on_action_triggered("plantSeed", {"seed": seed, "plots": plots})
        return f"Planted {seed} seed in plots: {plots}"

    def harvestPlots(plots: list[int]) -> str:
        """Harvest one or more garden plots.
        
        Args:
            plots: The list of integer IDs (1 to 9) representing the plots to harvest.
        """
        logger.info(f"Tool harvestPlots called: {plots}")
        on_action_triggered("harvestPlots", {"plots": plots})
        return f"Harvested plots: {plots}"

    return [
        litert_lm.tool_from_function(waterPlots),
        litert_lm.tool_from_function(plantSeed),
        litert_lm.tool_from_function(harvestPlots)
    ]
