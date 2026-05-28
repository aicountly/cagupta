const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.disableHierarchicalLookup = true;

const sharedConstantsRoot = path.resolve(workspaceRoot, 'packages/shared-constants/dist');
const sharedServicesRoot = path.resolve(workspaceRoot, 'packages/shared-services/dist');

config.resolver.extraNodeModules = {
  '@cagupta/shared-constants': sharedConstantsRoot,
  '@cagupta/shared-services': sharedServicesRoot,
};

const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@cagupta/shared-constants') {
    return context.resolveRequest(context, path.join(sharedConstantsRoot, 'index.js'), platform);
  }
  if (moduleName === '@cagupta/shared-services') {
    return context.resolveRequest(context, path.join(sharedServicesRoot, 'index.js'), platform);
  }
  if (moduleName.startsWith('@cagupta/shared-constants/')) {
    const sub = moduleName.slice('@cagupta/shared-constants/'.length);
    return context.resolveRequest(context, path.join(sharedConstantsRoot, `${sub}.js`), platform);
  }
  if (moduleName.startsWith('@cagupta/shared-services/')) {
    const sub = moduleName.slice('@cagupta/shared-services/'.length);
    return context.resolveRequest(context, path.join(sharedServicesRoot, `${sub}.js`), platform);
  }
  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
