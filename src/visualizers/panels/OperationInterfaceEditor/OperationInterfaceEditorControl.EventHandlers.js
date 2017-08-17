/*globals define*/
define([
    'panels/EasyDAG/EasyDAGControl.WidgetEventHandlers',
    './Colors'
], function(
    EasyDAGControlEventHandlers,
    COLORS
) {
    'use strict';
    var OperationInterfaceEditorEvents = function() {
        this._widget.allDataTypeIds = this.allDataTypeIds.bind(this);
        this._widget.allValidReferences = this.allValidReferences.bind(this);
        this._widget.addRefTo = this.addRefTo.bind(this);
        this._widget.setRefType = this.setRefType.bind(this);
        this._widget.changePtrName = this.changePtrName.bind(this);
        this._widget.removePtr = this.removePtr.bind(this);
        this._widget.getCreationNode = this.getCreationNode.bind(this);
    };

    OperationInterfaceEditorEvents.prototype.getCreationNode = function(type, id) {
        var typeName = type === 'Complex' ? 'Class' : 'Primitive',
            Decorator = this._client.decoratorManager.getDecoratorForWidget(
                this.DEFAULT_DECORATOR, 'EasyDAG');

        return {
            node: {
                id: id,
                class: 'create-node',
                name: `New ${typeName}...`,
                Decorator: Decorator,
                color: COLORS[type.toUpperCase()],
                isPrimitive: type === 'Primitive',
                attributes: {}
            }
        };
    };

    OperationInterfaceEditorEvents.prototype.allValidReferences = function() {
        // Get all meta nodes that...
        //  - are not data, pipeline or operation (or fco!)
        //  - have a plugin defined?
        // Currently you can't reference operations or pipelines.
        var notTypes = ['Data', 'Operation', 'Pipeline'];
        return this._client.getAllMetaNodes()
            .filter(node => {
                var plugins = node.getOwnRegistry('validPlugins');
                // Convention is enforced; if the plugin generates lua artifacts,
                // it should be called `Generate`.. (something)
                return plugins && plugins.indexOf('Generate') !== -1;
            })
            .filter(node => notTypes.reduce((valid, name) =>
                valid && !this.hasMetaName(node.getId(), name), true))
            .filter(node => node.getAttribute('name') !== 'FCO')
            .map(node => {
                return {
                    node: this._getObjectDescriptor(node.getId())
                };
            });
    };

    OperationInterfaceEditorEvents.prototype.allDataTypeIds = function(incAbstract) {
        return this.allDataTypes(incAbstract).map(node => node.getId());
    };

    OperationInterfaceEditorEvents.prototype.allDataTypes = function(incAbstract) {
        return this._client.getAllMetaNodes()
            .filter(node => this.hasMetaName(node.getId(), 'Data', incAbstract))
            .filter(node => !node.isAbstract());
    };

    OperationInterfaceEditorEvents.prototype.getValidSuccessors = function(nodeId) {
        if (nodeId !== this._currentNodeId) {
            return [];
        }

        return [{
            node: this._getObjectDescriptor(this.getDataTypeId())
        }];
    };

    OperationInterfaceEditorEvents.prototype.getRefName = function(node, basename) {
        // Get a dict of all invalid ptr names for the given node
        var invalid = {},
            name,
            i = 2;

        name = basename;
        node.getSetNames().concat(node.getPointerNames())
            .forEach(ptr => invalid[ptr] = true);
        
        while (invalid[name]) {
            name = basename + '_' + i;
            i++;
        }

        return name;
    };

    OperationInterfaceEditorEvents.prototype.addRefTo = function(targetId) {
        // Create a reference from the current node to the given type
        var opNode = this._client.getNode(this._currentNodeId),
            target = this._client.getNode(targetId),
            desiredName = target.getAttribute('name').toLowerCase(),
            ptrName = this.getRefName(opNode, desiredName),
            msg = `Adding ref "${ptrName}" to operation "${opNode.getAttribute('name')}"`;

        this._client.startTransaction(msg);
        this._client.setPointerMeta(this._currentNodeId, ptrName, {
            min: 1,
            max: 1,
            items: [
                {
                    id: targetId,
                    max: 1
                }
            ]
        });
        this._client.setPointer(this._currentNodeId, ptrName, null);
        this._client.completeTransaction();
    };

    OperationInterfaceEditorEvents.prototype.setRefType = function(ref, targetId) {
        var meta = this._client.getPointerMeta(this._currentNodeId, ref),
            msg = `Setting ${ref} reference type to ${targetId}`;

        if (!meta) {
            this.logger.debug(`No meta found for ${ref}. Creating a new reference to ${targetId}`);
            meta = {
                min: 1,
                max: 1,
                items: []
            };
        }

        meta.items.push({
            id: targetId,
            max: 1
        });

        this._client.startTransaction(msg);
        this._client.setPointerMeta(this._currentNodeId, ref, meta);
        this._client.completeTransaction();
    };

    OperationInterfaceEditorEvents.prototype.changePtrName = function(from, to) {
        var opNode = this._client.getNode(this._currentNodeId),
            name = opNode.getAttribute('name'),
            msg = `Renaming ref from "${from}" to "${to}" for ${name}`,
            meta = this._client.getPointerMeta(this._currentNodeId, from),
            ptrName;

        ptrName = this.getRefName(opNode, to);

        this._client.startTransaction(msg);

        // Currently, this will not update children already using old name...
        this._client.delPointerMeta(this._currentNodeId, from);
        this._client.delPointer(this._currentNodeId, from);
        this._client.setPointerMeta(this._currentNodeId, ptrName, meta);
        this._client.setPointer(this._currentNodeId, ptrName, null);

        this._client.completeTransaction();
    };

    OperationInterfaceEditorEvents.prototype.removePtr = function(name) {
        var opName = this._client.getNode(this._currentNodeId).getAttribute('name'),
            msg = `Removing ref "${name}" from "${opName}" operation`;

        this._client.startTransaction(msg);
        // Currently, this will not update children already using old name...
        this._client.delPointerMeta(this._currentNodeId, name);
        this._client.delPointer(this._currentNodeId, name);
        this._client.completeTransaction();
    };

    OperationInterfaceEditorEvents.prototype._createConnectedNode = function(typeId, isInput, baseName) {
        var name = this._client.getNode(this._currentNodeId).getAttribute('name'),
            msg = `Updating the interface of ${name}`,
            id;

        this._client.startTransation(msg);
        id = this.createIONode(this._currentNodeId, typeId, isInput, baseName, true);

        // TODO: update the code
        // How can I do this? Can I parse the code to find the indices of the args
        // to the 'execute' fn?

        this._client.completeTransation();

        return id;
    };

    OperationInterfaceEditorEvents.prototype._deleteNode = function(nodeId) {
        // TODO: update the code on input deletion
        console.log('TODO: update the source code...');
        // If the input name is used in the code, maybe just comment it out in the args
        return EasyDAGControlEventHandlers.prototype._deleteNode.apply(this, arguments);
    };

    return OperationInterfaceEditorEvents;
});
