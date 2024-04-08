#!/bin/bash -e

npx ts-node -e "
import { PostgresContainer } from './src/./postgres-container'
(async () => {
  const pgcontainer = await PostgresContainer.start('latest');

  while (true) {
    console.log(process.pid + ':' + pgcontainer.containerId);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
})()
"
