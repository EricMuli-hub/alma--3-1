#!/bin/sh
# Lets the Alma container reach this node's API. The API is only open inside the compose network, never to the internet.
ipfs config Addresses.API /ip4/0.0.0.0/tcp/5001
ipfs config profile apply server
