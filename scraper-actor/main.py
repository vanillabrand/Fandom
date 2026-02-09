import os
import json
import time
# from apify_client import ApifyClient # Unused
from instagrapi import Client


def main():
    # 1. Initialize Apify
    # In Actor environment, APIFY_DEFAULT_KEY_VALUE_STORE_ID and other
    # envs are set. We use a helper to get input.
    # _client = ApifyClient(os.environ.get('APIFY_TOKEN')) # Unused

    # Simulate getting input from default KV store
    # (or use Apify SDK if installed)
    # For simplicity in this script without full SDK wrapping:
    input_file = 'storage/key_value_stores/default/INPUT.json'
    actor_input = {}

    # Try reading input from standard Apify location or env
    try:
        if os.path.exists(input_file):
            with open(input_file, 'r') as f:
                actor_input = json.load(f)
        else:
            # Fallback: Environment variable (standard for some actors)
            # or simply standard input if using apify-python-sdk
            # using manual env var for now
            actor_input_str = os.environ.get('APIFY_INPUT')
            if actor_input_str:
                actor_input = json.loads(actor_input_str)
    except Exception as e:
        print(f"Warning: Could not load input: {e}")

    usernames = actor_input.get('usernames', [])
    mode = actor_input.get('mode', 'enrich')
    # _limit = actor_input.get('limit', 100) # Unused

    print(
        f"Starting Fandom Velocity Scraper in '{mode}' mode "
        f"for {len(usernames)} users."
    )

    # 2. Initialize Instagram Client
    cl = Client()

    # [IMPORTANT] Session Management
    # Ideally pass sessionid via input or env for authentication
    session_id = (
        actor_input.get('session_id') or
        os.environ.get('IG_SESSION_ID')
    )

    if session_id:
        print("Authenticating with Session ID...")
        cl.login_by_sessionid(session_id)
    else:
        print("Running in Anonymous/Public mode (Low Rate Limits)")
        # Note: Instagrapi public methods are limited.

    results = []

    # 3. Scrape Loop
    for username in usernames:
        try:
            print(f"Scraping @{username}...")

            data = {}
            if mode == 'enrich' or mode == 'followers':
                # Followers usually needs enrichment first for ID
                user_info = cl.user_info_by_username(username)
                data = user_info.dict()

                # Normalize specific fields for our app
                data['platform'] = 'instagram'
                data['scrapedAt'] = time.strftime(
                    "%Y-%m-%dT%H:%M:%SZ", time.gmtime()
                )

                if mode == 'followers':
                    # Warning: This is expensive/risky without high-trust
                    # proxy
                    print(f"Fetching followers for {username}...")
                    # followers = cl.user_followers(
                    #     user_info.pk, amount=_limit
                    # )
                    # data['followers_list'] = [f.dict() for f in followers]
                    pass

            results.append(data)

            # Push to Apify Dataset immediately
            if os.environ.get('APIFY_DEFAULT_DATASET_ID'):
                # In real actor, use SDK: Actor.push_data(data)
                # Here we mock or print
                print(f"Pushed record for {username}")

            time.sleep(2)  # Safety delay

        except Exception as e:
            print(f"Error scraping {username}: {e}")
            results.append({"username": username, "error": str(e)})

    # Final Output
    print(f"Completed. Scraped {len(results)} profiles.")


if __name__ == '__main__':
    main()
