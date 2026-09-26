# Editor architecture target

The Phase 0–3 implementation does not refactor the renderer. The accepted target remains one persistent engineering workspace:

```text
Project Tree | Canvas | Properties
```

Input, Physical, Hardware, and Slices are modes/layers of the same Canvas and selection model. The renderer must consume LedMAP Core rather than duplicate mapping, cabinet, or hardware calculations. Project state, transient editor state, selection, viewport, history, commands, canvas layers, and external adapters are separate responsibilities for later phases.
