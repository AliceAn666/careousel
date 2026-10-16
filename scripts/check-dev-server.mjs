import fs from "node:fs";

const file = ".next/dev/lock";
if (fs.existsSync(file)) {
  let pid;
  try {
    pid = JSON.parse(fs.readFileSync(file, "utf8")).pid;
    if (!Number.isInteger(pid) || pid <= 0) throw new Error("Invalid lock PID");
  } catch {
    console.error(
      "Cannot read the development-server lock. Check that the server is stopped before running setup.",
    );
    process.exit(1);
  }
  let running = true;
  try {
    process.kill(pid, 0);
  } catch (error) {
    if (error.code === "ESRCH") running = false;
  }
  // Next may leave a lock after shutdown. A Linux zombie no longer runs a server;
  // allow Next itself to reclaim that stale lock at the next startup.
  if (running && fs.existsSync(`/proc/${pid}/stat`)) {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
    if (
      stat
        .slice(stat.lastIndexOf(")") + 1)
        .trim()
        .startsWith("Z")
    )
      running = false;
  }
  if (running) {
    console.error(
      "A development server is running. Stop it with Ctrl+C before installing dependencies.",
    );
    process.exit(1);
  }
}
