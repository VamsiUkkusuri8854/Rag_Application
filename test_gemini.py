
import os
from pathlib import Path
from dotenv import load_dotenv

from langchain_google_genai import ChatGoogleGenerativeAI

# Load project .env
env_path = Path(__file__).resolve().parent / ".env"
load_dotenv(env_path, override=True)

api_key = os.getenv("GOOGLE_API_KEY")
model_name = os.getenv("GEMINI_CHAT_MODEL")

print("Testing Gemini Chat Model:", model_name)

try:
    llm = ChatGoogleGenerativeAI(
        model=model_name,
        google_api_key=api_key,
        temperature=0.2
    )

    response = llm.invoke(
        "Explain machine learning in three simple sentences."
    )

    print("\nGemini Response:")
    print(response.content)

    print("\nChat model test successful!")

except Exception as error:
    print("\nChat model test failed!")
    print("Error:", error)
