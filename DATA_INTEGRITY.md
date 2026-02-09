# Data Integrity & Anti-Hallucination Safeguards

## Overview
This document outlines the critical safeguards implemented in the Fandom Analytics Orchestration Layer to ensure that all data visualized on the map is **genuine, verified, and statistically significant**.

## 1. Strict Node Validation (Anti-Hallucination)
**Purpose**: To prevent the AI (Gemini) from "hallucinating" or inventing users when constructing the graph.

**Mechanism**:
- During **Semantic Analysis** (`orchestrationService.ts`), the AI suggests "Key Opinion Leaders" or "Topic Hubs" based on the context.
- The system enforces a **Strict Validation Check**:
  - Before creating an "Evidence Node" for an AI-suggested user, the code checks `accumulatedRecords` (the raw scraped dataset).
  - **Rule**: If the user does not exist in the scraped data (or lacks a follower count), the node is **SKIPPED**.
  - **Log**: A warning is logged: `[Safety] Skipped hallucinated/unknown user suggestion: <username>`.

**Outcome**: Every "Person" or "Creator" node on the Quick Map is guaranteed to be a real account that was actually scraped.

## 2. Hollow Plan Protection (2-Hop Enforcement)
**Purpose**: To ensuring "Audience Overlap" and "Network Cluster" analyses always have sufficient depth.

**Problem**:
- "Over-indexing" requires comparing a user's *Followers* against *their* Following lists.
- Sometimes, the AI generates a "Hollow Plan" with only 1 step (Scrape Followers), missing the 2nd hop (Scrape Following).

**Mechanism**:
- The `detectAndFixHollowPlan` function in `orchestrationService.ts` analyzes the AI's plan before execution.
- **Rule**: If `intent` is `audience_overlap` OR `network_clusters` AND the plan has < 2 steps:
  - The system **automatically injects** the missing 2nd step.
  - It targets `USE_DATA_FROM_STEP_1` to scrape the following lists of the previously scraped followers.

**Outcome**: Prevents "Empty Map" errors where the analysis has no data to compare against.

## 3. Fingerprint Verification
**Purpose**: To prevent redundant scraping and ensure correct caching.

**Mechanism**:
- Every scrape job generates a unique `fingerprint` hash based on input parameters.
- The system checks `/api/fingerprints/:fingerprint` before starting a run.
- **Outcome**: Efficient resource usage and robust caching.

## 4. Semantic Analysis Safeguards (Prompt Engineering)
**Purpose**: To ensure AI-generated insights (Deep Search & Entity Inspector) for un-scraped data are grounded in reality.

**Mechanism**:
- **Deep Search (`analyzeBatch`)**:
  - **Constraint**: "STRICT EXTRACTION ONLY: Do NOT use outside knowledge to invent entities. Only extract what is explicitly written in the text or bio."
  - **Outcome**: Prevents the AI from "filling in the blanks" with widely known but absent facts.
- **Entity Inspector (`fetchFandomAnalysis`)**:
  - **Constraint**: "VERIFY URLs: Every sourceUrl MUST be a reachable, real URL found in search results."
  - **Temperature**: Set to **0.0** (Maximum Determinism).
  - **Outcome**: Ensures "Rising Stars" and "Clusters" are backed by actual search results, not hallucinated patterns.
