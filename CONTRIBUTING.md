# Contributing to StoreBridge

Thank you for your interest in contributing! This guide explains the process.

## Development Setup

```bash
git clone https://github.com/ak9347128658/storix.git
cd storebridge
npm install
npm run build
npm test
```

## Project Structure

```
src/
├── core/           # StorageClient, BaseProvider, ProviderFactory
├── providers/      # One folder per provider
├── middleware/     # MiddlewareChain
├── hooks/          # HookSystem
├── logger/         # Logger
├── errors/         # Error hierarchy
├── utils/          # mime, retry, stream, hash
├── validators/     # ConfigValidator
└── types/          # All TypeScript types
```

## Adding a New Provider

1. Create `src/providers/<name>/<Name>Provider.ts`
2. Extend `BaseProvider` and implement all `protected abstract do*` methods
3. Export from `src/providers/<name>/index.ts`
4. Add the credential type to `src/types/config.ts`
5. Add the discriminant to `StorageConfig` union in `src/types/config.ts`
6. Add required fields to `REQUIRED_FIELDS` in `src/validators/ConfigValidator.ts`
7. Add the lazy import in `src/core/ProviderFactory.ts`
8. Add to `tsup.config.ts` entry points
9. Add to `package.json` exports and peerDependencies
10. Write tests in `src/tests/providers/<name>.test.ts`
11. Update README.md feature matrix and provider table

## Coding Standards

- No `any` types — use generics or unknown
- No unused variables
- Prefer async/await over raw Promises
- Never swallow errors — always rethrow or convert to a typed StoreBridgeError
- No `console.log` — use the `Logger` class
- All public API must have JSDoc comments
- Tests must cover the happy path, not-found, and error cases

## Commit Convention

We use [Conventional Commits](https://www.conventionalcommits.org/).

```
feat(providers): add Cloudinary provider
fix(s3): handle empty ETag from multipart complete
docs(readme): fix GCS credential example
chore(deps): update @aws-sdk to 3.700
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `perf`

## Pull Request Process

1. Fork and create a feature branch: `git checkout -b feat/my-feature`
2. Ensure `npm run typecheck && npm test && npm run lint` all pass
3. Open a PR against `main` with a clear description
4. Address review feedback

## Releasing

Releases are fully automated via semantic-release on merge to `main`.

## License

By contributing you agree that your contributions will be licensed under the project's MIT license.
