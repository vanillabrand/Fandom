import unittest
from unittest.mock import MagicMock, patch
import json
import os
import sys

# Mock external libs BEFORE importing main to avoid import errors
sys.modules['apify_client'] = MagicMock()
sys.modules['instagrapi'] = MagicMock()

import main  # noqa: E402


class TestFandomVelocityScraper(unittest.TestCase):

    @patch('main.Client')
    @patch.dict(os.environ, {
        'APIFY_TOKEN': 'mock_token',
        'APIFY_DEFAULT_DATASET_ID': 'mock_dataset'
    })
    def test_enrich_flow(self, MockInstaClient):
        """Test the enrichment flow with mocked APIs"""

        # Setup Mocks
        mock_insta = MockInstaClient.return_value
        mock_info = MagicMock()
        mock_info.dict.return_value = {
            'pk': '12345',
            'username': 'testuser',
            'full_name': 'Test User',
            'follower_count': 1000
        }
        mock_insta.user_info_by_username.return_value = mock_info

        # Determine Input
        mock_input = {
            "usernames": ["testuser"],
            "mode": "enrich"
        }

        # Run Main (captured via patching/mocking input logic inside main
        # if possible, or we just test the logic blocks. For simplicity,
        # we'll patch the file loading in main)

        with patch(
            'builtins.open', unittest.mock.mock_open(
                read_data=json.dumps(mock_input)
            )
        ):
            with patch('os.path.exists', return_value=True):
                main.main()

        # Verification
        # 1. Check if Instagram login was skipped (no session id provided)
        mock_insta.login_by_sessionid.assert_not_called()

        # 2. Check if user_info was called
        mock_insta.user_info_by_username.assert_called_with('testuser')

    @patch('main.Client')
    def test_followers_flow(self, MockInstaClient):
        """Test the followers flow"""
        # ... logic similar to above ...
        pass


if __name__ == '__main__':
    print("Running Fandom Velocity Scraper Tests...")
    unittest.main()
