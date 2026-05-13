 Step 1 — Log in to npm (run this first, it's interactive):
  ! npm login

  Step 2 — Verify you're logged in and the package name is available:
  ! npm whoami
  ! npm view storix

  ● You need to set the Packages and scopes permission. Here's exactly what to fill:

  Token name: storebridge-publish ✅

  Allowed IP ranges: Leave this empty (remove the IP you entered — it's causing the invalid CIDR error and is not needed)

  Packages and scopes → Permissions: Change from No access → Read and write

  Organizations → Permissions: Leave as No access ✅

  Expiration: Keep as is ✅

  Then click Generate token, copy it, and run:

  npm config set //registry.npmjs.org/:_authToken YOUR_TOKEN_HERE

  npm publish --access public
