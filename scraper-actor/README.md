# Fandom Velocity Scraper (Phase 4)

This directory contains the Python code for the custom high-performance Apify Actor.

## Structure
- `main.py`: The entry point for the actor. Uses `instagrapi` to scrape data.
- `input_schema.json`: Defines the input JSON expected by the actor.
- `Dockerfile`: Configuration for building the actor image on Apify.
- `requirements.txt`: Python dependencies.
- `test_scraper.py`: A unit test script that MOCKS the external libraries, allowing you to verifying the logic flow without installing heavy dependencies locally.

## How to Test Locally
1. Ensure you have Python installed.
2. Run the mock test (no dependencies needed):
   ```bash
   python test_scraper.py
   ```
3. To run the *actual* scraper locally (requires dependencies):
   ```bash
   pip install -r requirements.txt
   export APIFY_TOKEN="your_token"
   python main.py
   ```

## Integration
Once verified, uncomment the entry in `services/apifyScraperService.ts` to enable this actor in the Fandom dashboard.
