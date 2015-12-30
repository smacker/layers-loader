import path from 'path';
import falafel from 'falafel';
import loaderUtils from 'loader-utils';

import { getOutput } from './getOutput';
import getConfig from './getConfig';
import getChain from './getChain';

export default function(source) {
    if (this.cacheable) {
        this.cacheable();
    }

    const callback = this.async();
    const query = loaderUtils.parseQuery(this.query);

    getConfig(query).then(layers => {
        const pathsToInclude = layers.map(layer => layer.path).concat(query.include || []);
        const isFileInheritable = pathsToInclude.some(layerPath => {
            return this.resourcePath.indexOf(layerPath) === 0 &&
                   this.resourcePath.indexOf(path.resolve(layerPath, 'node_modules/')) !== 0;
        });

        if (!isFileInheritable) {
            return callback(null, source);
        }

        const requiresPromises = [];
        const out = falafel(source, node => {
            if (
                node.type === 'CallExpression' &&
                node.callee.type === 'Identifier' &&
                node.callee.name === 'require' &&
                node.arguments[0].value.charAt(0) === '#'
            ) {
                const rawRequireValue = node.arguments[0].value;

                requiresPromises.push(
                    getChain(rawRequireValue, this.resourcePath, layers).then(result => {
                        node.update(
                            getOutput(result)
                        );
                    })
                );
            }
        });

        // no promised requires
        if (!requiresPromises.length) {
            return callback(null, source);
        }

        // wait for every promised require
        Promise.all(requiresPromises).then(() => {
            callback(null, out.toString());
        });
    });
}