import Docker from "dockerode";

export interface ContainerSummary {
  id: string;
  name: string;
  image: string;
  state: string; // running | exited | created ...
  status: string; // human text
  ports: { private: number; public?: number }[];
}

export interface LaunchRequest {
  image: string;
  name?: string;
  /** "8080:80, 5432:5432" */
  ports?: string;
  /** "/host/path:/container/path" comma-separated */
  volumes?: string;
  cmd?: string;
  env?: string; // KEY=VALUE per line
}

export class DockerService {
  private docker = new Docker();

  async available(): Promise<boolean> {
    try {
      await this.docker.ping();
      return true;
    } catch {
      return false;
    }
  }

  async listContainers(): Promise<ContainerSummary[]> {
    const list = await this.docker.listContainers({ all: true });
    return list.map((c) => ({
      id: c.Id,
      name: (c.Names?.[0] ?? "").replace(/^\//, ""),
      image: c.Image,
      state: c.State,
      status: c.Status,
      ports: (c.Ports ?? []).map((p) => ({
        private: p.PrivatePort,
        public: p.PublicPort,
      })),
    }));
  }

  async listImages(): Promise<{ id: string; tags: string[]; size: number }[]> {
    const imgs = await this.docker.listImages();
    return imgs
      .filter((i) => i.RepoTags?.length && i.RepoTags[0] !== "<none>:<none>")
      .map((i) => ({
        id: i.Id.replace("sha256:", "").slice(0, 12),
        tags: i.RepoTags ?? [],
        size: i.Size,
      }));
  }

  async launch(req: LaunchRequest): Promise<string> {
    const exposed: Record<string, object> = {};
    const bindings: Record<string, { HostPort: string }[]> = {};
    for (const pair of (req.ports ?? "").split(",")) {
      const [host, cont] = pair.trim().split(":");
      if (!host || !cont) continue;
      exposed[`${cont}/tcp`] = {};
      bindings[`${cont}/tcp`] = [{ HostPort: host }];
    }
    const binds = (req.volumes ?? "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    const env = (req.env ?? "")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.includes("="));

    const container = await this.docker.createContainer({
      Image: req.image,
      name: req.name || undefined,
      Tty: true,
      OpenStdin: true,
      Cmd: req.cmd ? ["sh", "-c", req.cmd] : undefined,
      Env: env.length ? env : undefined,
      ExposedPorts: Object.keys(exposed).length ? exposed : undefined,
      HostConfig: {
        PortBindings: Object.keys(bindings).length ? bindings : undefined,
        Binds: binds.length ? binds : undefined,
      },
    });
    await container.start();
    return container.id;
  }

  async start(id: string) {
    await this.docker.getContainer(id).start();
  }

  async stop(id: string) {
    await this.docker.getContainer(id).stop({ t: 5 });
  }

  async remove(id: string) {
    await this.docker.getContainer(id).remove({ force: true });
  }
}
