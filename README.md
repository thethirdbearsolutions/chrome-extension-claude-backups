# Automatically back up your Claude conversations

See our blog post for more details, background, and motivation: https://thirdbear.substack.com/p/backing-up-your-claude-conversations

# How to Use This Extension

## Install the Extension:

1. Clone this repo, or [download and unpack the zip archive](https://github.com/thethirdbearsolutions/chrome-extension-claude-backups/archive/refs/heads/main.zip)
2. In Chrome, go to chrome://extensions/
3. Enable "Developer mode" (top right)
4. Click "Load unpacked" and select your extension directory

## Configure the Extension:

1. Click on the extension to view details
2. Click "extension options"
3. Set your preferred download directory (all backups will be saved to a subdirectory within Chrome's downloads folder)
4. Click "Save Settings"
5. Optionally, kick off a first run right away

## Automatic Backups:

* The extension will automatically back up your conversations every eight hours
* You can also trigger an immediate backup by clicking the extension icon or the "Backup Conversations Now" button in options

## Explore Your Backups:

* All conversations are saved as JSON files in your specified download directory
* Each file is named based on the conversation title and its UUID
* An index file with metadata is also created for easy reference

# Key Features

* Automatic backups 3x daily
* Complete conversation history - includes all messages in each conversation
* Conversation metadata - preserves names, dates, and organization info
* Handles pagination - will fetch all conversations, even if you have
  hundreds
* Incremental backup - only fetches conversations that have been
  created or updated since the last run

# Important Note on Terms of Service

This extension accesses Claude's unofficial web APIs through your
authenticated browser session. While it only backs up your own
conversations and operates within your personal browser environment,
this approach may technically fall into a gray area of Claude's Terms
of Service, which restricts "automated access" outside the official
API and "harvesting data" from their services. 

We believe this personal backup tool is consistent with the spirit of
user data ownership (as the Terms state: "you retain any right, title,
and interest that you have in the Inputs you submit... we assign to
you all of our right, title, and interest—if any—in
Outputs"). However, use this tool at your own discretion. 

If Anthropic provides an official method for automatically backing up
conversations on a periodic schedule in the future, we recommend using
that method instead.
