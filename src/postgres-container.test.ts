import Dockerobe from 'dockerode';
import {
  PostgresContainer,
  PostgresContainerConfig,
} from './postgres-container';

const mockContainer = {
  start: jest.fn().mockResolvedValue({}),
  inspect: jest.fn().mockResolvedValue({
    NetworkSettings: { Ports: {} },
    State: { Running: true, Health: { Status: 'healthy' } },
  }),
  remove: jest.fn().mockResolvedValue({}),
  stop: jest.fn().mockResolvedValue({}),
};

jest.mock('dockerode', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    pull: jest.fn().mockResolvedValue({}),
    getImage: jest.fn().mockReturnValue({
      inspect: jest.fn().mockRejectedValue({ statusCode: 404 }),
    }),
    modem: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      followProgress: (stream: any, callback: any) => {
        callback(null, {});
      },
    },
    createContainer: jest.fn().mockResolvedValue(mockContainer),
    getContainer: jest.fn().mockReturnValue(mockContainer),
  })),
}));

jest.mock('net', () => ({
  createServer: jest.fn().mockReturnValue({
    unref: jest.fn(),
    listen: (port: number, cb: () => void) => {
      cb();
    },
    on: jest.fn(),
    address: jest.fn().mockReturnValue({ port: 5432 }),
  }),
  Socket: jest.fn().mockImplementation(() => ({
    on: (event: string, cb: () => void) => {
      if (event === 'connect') {
        console.log('connect');
        cb();
      }
    },
    connect: jest.fn(),
  })),
}));

describe('PostgresContainer', () => {
  it('should start postgres container', async () => {
    const config: PostgresContainerConfig = {
      database: 'test-db',
      username: 'test-user',
      password: 'test-password',
      sslmode: 'disable',
      debug: true,
    };

    const pgcontainer = await PostgresContainer.start('latest', config);
    console.log(pgcontainer);

    expect(Dockerobe).toHaveBeenCalledTimes(1);
    expect(mockContainer.start).toHaveBeenCalledTimes(1);

    await pgcontainer.shutdown();

    expect(mockContainer.stop).toHaveBeenCalledTimes(1);
  });
});
