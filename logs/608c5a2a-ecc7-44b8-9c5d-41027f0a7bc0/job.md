Target repo: `clawforge`

Use `/gsd:quick` for this task.

Find the container startup/entrypoint mechanism — likely a `Dockerfile`, `entrypoint.sh`, or similar init script that runs before each job container executes its task.

Add a step that runs `/gsd:update` (i.e., `claude /gsd:update` or however GSD commands are invoked in this environment) at container startup, so every job container gets the latest version of GSD before executing its task.

If there are multiple places where containers are initialized, update all relevant ones. Commit the changes with a clear message explaining what was added and why.