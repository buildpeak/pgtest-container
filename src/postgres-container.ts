import { randomInt } from 'crypto';
import * as net from 'net';
import Dockerobe from 'dockerode';

export type PostgresContainerConfig = {
  database?: string;
  username?: string;
  password?: string;
  sslmode?: string;
  debug?: boolean;
};

let debug = process.env.DEBUG === '1';

export class PostgresContainer {
  static containerIds: string[] = [];

  private constructor(
    public readonly containerId: string,
    public readonly password: string,
    public readonly port: number,
    public readonly connectionUri: string,
  ) {}

  static async start(version: string, config?: PostgresContainerConfig) {
    // register the cleanup function
    process.on('SIGINT', PostgresContainer.cleanup);
    process.on('SIGHUP', PostgresContainer.cleanup);
    process.on('SIGTERM', PostgresContainer.cleanup);

    process.on('unhandledRejection', async (error) => {
      console.error('Unhandled promise rejection:', error);
      await PostgresContainer.cleanup();
      throw error;
    });

    debug ||= !!config?.debug;

    const docker = new Dockerobe();

    const imageTag = `postgres:${version}`;

    try {
      await docker.getImage(imageTag).inspect();
    } catch (error) {
      if ((error as { statusCode: number }).statusCode === 404) {
        console.log(`Pulling image: ${imageTag}`);
        const stream = await docker.pull(imageTag);
        await new Promise<void>((resolve, reject) => {
          docker.modem.followProgress(stream, (error, _result) => {
            if (error) {
              reject(error);
            } else {
              resolve();
            }
          });
        });
      } else {
        throw error;
      }
    }

    const db = config?.database || 'pgtest';
    const username = config?.username || 'pgtest';
    const password = config?.password || randomPassword();

    const env = {
      POSTGRES_DB: db,
      POSTGRES_USER: username,
      POSTGRES_PASSWORD: password,
      // POSTGRES_HOST_AUTH_METHOD: 'trust',
      TZ: 'UTC',
    };

    const port = await randomPort();

    const container = await docker.createContainer({
      Image: imageTag,
      Env: Object.entries(env).map(([key, value]) => `${key}=${value}`),
      Healthcheck: {
        Test: ['CMD-SHELL', `pg_isready -U ${username}`],
        Interval: 1_000_000_000,
        Timeout: 1_000_000_000,
        Retries: 10,
      },
      HostConfig: {
        PortBindings: { '5432/tcp': [{ HostPort: port.toString() }] },
      },
    });

    // register the container id for cleanup
    PostgresContainer.containerIds.push(container.id);

    try {
      await container.start();

      await waitUntilHealthy(docker, container.id);

      await waitUntilConnectable(`127.0.0.1`, port);

      const connectionUri =
        `postgresql://${username}:${password}@127.0.0.1:${port}/${db}` +
        `?sslmode=${config?.sslmode || 'disable'}`;

      return new PostgresContainer(container.id, password, port, connectionUri);
    } catch (error) {
      console.error('Error starting container:', error);
      throw error;
    }
  }

  async shutdown() {
    const docker = new Dockerobe();
    const container = docker.getContainer(this.containerId);
    await container.stop();
    await container.remove();
  }

  static async cleanup(signal?: NodeJS.Signals) {
    console.log(`caught signal: ${signal}`);

    const docker = new Dockerobe();
    for (const id of PostgresContainer.containerIds) {
      console.log(`stopping and removing container: ${id}`);
      const container = docker.getContainer(id);
      await container.stop();
      await container.remove();
    }
  }
}

async function waitUntilHealthy(docker: Dockerobe, containerId: string) {
  const container = docker.getContainer(containerId);
  let exit = false;
  while (!exit) {
    const info = await container.inspect();
    if (debug) {
      console.log('health state: %s', info.State.Health?.Status);
    }
    if (info.State.Health?.Status === 'healthy') {
      exit = true;
    } else if (info.State.Health?.Status === 'unhealthy') {
      throw new Error('Container is unhealthy');
    } else {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}

async function waitUntilConnectable(host: string, port: number) {
  const socket = new net.Socket();
  let exit = false;
  while (!exit) {
    if (debug) {
      console.log(`waiting for ${host}:${port}`);
    }
    try {
      await new Promise<void>((resolve, reject) => {
        socket.on('connect', () => {
          exit = true;
          socket.end();
          resolve();
        });
        socket.on('error', reject);
        socket.connect(port, host);
      });
      return;
    } catch (error) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}

const passwordLetters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

function randomPassword(): string {
  const passwordLength = 32;
  return Array.from({ length: passwordLength })
    .map(() => passwordLetters[randomInt(passwordLetters.length)])
    .join('');
}

function randomPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('Invalid server address'));
      } else {
        resolve(address.port);
      }
      server.close();
    });
  });
}
