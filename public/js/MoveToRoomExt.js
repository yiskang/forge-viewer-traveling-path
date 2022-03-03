/////////////////////////////////////////////////////////////////////
// Copyright (c) Autodesk, Inc. All rights reserved
// Written by Forge Partner Development
//
// Permission to use, copy, modify, and distribute this software in
// object code form for any purpose and without fee is hereby granted,
// provided that the above copyright notice appears in all copies and
// that both that copyright notice and the limited warranty and
// restricted rights notice below appear in all supporting
// documentation.
//
// AUTODESK PROVIDES THIS PROGRAM "AS IS" AND WITH ALL FAULTS.
// AUTODESK SPECIFICALLY DISCLAIMS ANY IMPLIED WARRANTY OF
// MERCHANTABILITY OR FITNESS FOR A PARTICULAR USE.  AUTODESK, INC.
// DOES NOT WARRANT THAT THE OPERATION OF THE PROGRAM WILL BE
// UNINTERRUPTED OR ERROR FREE.
/////////////////////////////////////////////////////////////////////

(function () {
    class RoomListPanel extends Autodesk.Viewing.UI.DockingPanel {
        constructor(parent) {
            const options = {};

            //  Height adjustment for scroll container, offset to height of the title bar and footer by default.
            if (!options.heightAdjustment)
                options.heightAdjustment = 70;

            if (!options.marginTop)
                options.marginTop = 0;

            //options.addFooter = false;

            const viewer = parent.viewer;
            super(viewer.container, viewer.container.id + 'RoomListPanel', 'Rooms', options);

            this.container.classList.add('adn-docking-panel');
            this.container.classList.add('adn-room-list-panel');
            this.createScrollContainer(options);

            this.viewer = viewer;
            this.parent = parent;
            this.options = options;
            this.uiCreated = false;

            this.addVisibilityListener(async (show) => {
                if (!show) return;

                if (!this.uiCreated)
                    await this.createUI();
            });
        }

        async createUI() {
            this.uiCreated = true;

            const div = document.createElement('div');

            const treeDiv = document.createElement('div');
            div.appendChild(treeDiv);
            this.treeContainer = treeDiv;
            this.scrollContainer.appendChild(div);

            const data = await this.getRoomData();
            this.buildTree(data);
        }

        async getRoomData() {
            const getRoomDbIds = () => {
                return new Promise((resolve, reject) => {
                    this.viewer.search(
                        'Revit Rooms',
                        (dbIds) => resolve(dbIds),
                        (error) => reject(error),
                        ['Category'],
                        { searchHidden: true }
                    );
                });
            };

            const getPropertiesAsync = (dbId) => {
                return new Promise((resolve, reject) => {
                    this.viewer.getProperties(
                        dbId,
                        (result) => resolve(result),
                        (error) => reject(error),
                    );
                });
            }

            const data = [];

            try {
                const roomDbIds = await getRoomDbIds();
                if (!roomDbIds || roomDbIds.length <= 0) {
                    throw new Error('No Rooms found in current model');
                }

                for (let i = 0; i < roomDbIds.length; i++) {
                    const dbId = roomDbIds[i];
                    const propData = await getPropertiesAsync(dbId);

                    data.push({
                        id: propData.externalId,
                        dbId,
                        name: propData.name
                    });
                }

            } catch (ex) {
                console.warn(`[RoomListPanel]: ${ex}`);
                throw new Error('Failed to extract room data');
            }

            return data;
        }

        getBoundingBox(dbId) {
            const model = this.viewer.model;
            const it = model.getInstanceTree();
            const fragList = model.getFragmentList();
            let bounds = new THREE.Box3();

            it.enumNodeFragments(dbId, (fragId) => {
                let box = new THREE.Box3();
                fragList.getWorldBounds(fragId, box);
                bounds.union(box);
            }, true);

            return bounds;
        }

        buildTree(data) {
            const nodes = [];

            for (let i = 0; i < data.length; i++) {
                const node = {
                    id: data[i].id,
                    dbId: data[i].dbId,
                    type: 'spaces',
                    text: data[i].name
                };

                nodes.push(node);
            }

            console.log(nodes);

            $(this.treeContainer)
                .jstree({
                    core: {
                        data: nodes,
                        multiple: false,
                        themes: {
                            icons: false,
                            name: 'default-dark'
                        }
                    },
                    sort: function (a, b) {
                        const a1 = this.get_node(a);
                        const b1 = this.get_node(b);
                        return (a1.text > b1.text) ? 1 : -1;
                    },
                    checkbox: {
                        keep_selected_style: false,
                        three_state: false,
                        deselect_all: true,
                        cascade: 'none'
                    },
                    types: {
                        spaces: {}
                    },
                    plugins: ['types', 'sort', 'wholerow'],
                })
                .on('changed.jstree', async (e, data) => {
                    console.log(e, data);
                    console.log(data.node.original);

                    const { dbId } = data.node.original;

                    if (!dbId) return;

                    const bbox = this.getBoundingBox(dbId);
                    const center = bbox.center();
                    const point = new THREE.Vector3(center.x, center.y, bbox.min.z);

                    this.parent.tweenToPoint(point);
                });
        }
    }

    class MoveToRoomExtension extends Autodesk.Viewing.Extension {
        constructor(viewer, options) {
            super(viewer, options);
            this.cameraTweenTool = null;
            this.uiCreated = false;
        }

        onToolbarCreated(toolbar) {
            const panel = new RoomListPanel(this);
            viewer.addPanel(panel);

            this.panel = panel;

            const roomsPanelButton = new Autodesk.Viewing.UI.Button('room-panel-button');
            roomsPanelButton.onClick = () => {
                panel.setVisible(!panel.isVisible());
            };

            roomsPanelButton.setToolTip('Open room list panel');

            this.group = new Autodesk.Viewing.UI.ControlGroup('room-nav-tool-group');
            this.group.addControl(roomsPanelButton);
            toolbar.addControl(this.group);
        }

        tweenToPoint(point) {
            this.viewer.setActiveNavigationTool('bimwalk');

            const views = [];
            const up = new THREE.Vector3(0, 0, 1);
            const currentEye = this.viewer.navigation.getPosition().clone();

            const targetPos = point.clone().add(up.clone().multiplyScalar(1.7 * 3.2808399));
            const sightDir = point.clone().sub(currentEye).normalize();
            const eyeLen = this.viewer.navigation.getEyeVector().length();
            const target = targetPos.clone().add(sightDir.clone().multiplyScalar(eyeLen));

            views.push({
                up: up.toArray(),
                eye: targetPos.toArray(),
                target: target.toArray()
            });

            this.processTweens(views);
        }

        executeTweenPromised(view) {
            return new Promise((resolve, reject) => {
                const onTweenExecuted = (event) => {
                    console.log(event);
                    this.viewer.removeEventListener(
                        Autodesk.ADN.CameraTweenTool.CAMERA_TWEEN_ANIMATION_COMPLETED_EVENT,
                        onTweenExecuted
                    );

                    resolve();
                };

                this.viewer.addEventListener(
                    Autodesk.ADN.CameraTweenTool.CAMERA_TWEEN_ANIMATION_COMPLETED_EVENT,
                    onTweenExecuted
                );

                this.cameraTweenTool.tweenCameraTo({ viewport: view });
            });
        }

        processTweens(data) {
            //process each promise
            //refer to http://jsfiddle.net/jfriend00/h3zaw8u8/
            const promisesInSequence = (tasks, callback) => {
                const results = [];
                return tasks.reduce((p, item) => {
                    return p.then(() => {
                        return callback(item).then((data) => {
                            results.push(data);
                            return results;
                        });
                    });
                }, Promise.resolve());
            };

            //start to process
            return promisesInSequence(data, (d) => this.executeTweenPromised(d));
        }

        async load() {
            const loadCSS = (href) => new Promise(function (resolve, reject) {
                const el = document.createElement('link');
                el.rel = 'stylesheet';
                el.href = href;
                el.onload = resolve;
                el.onerror = reject;
                document.head.appendChild(el);
            });

            await Promise.all([
                Autodesk.Viewing.Private.theResourceLoader.loadScript('https://unpkg.com/@tweenjs/tween.js@18.6.4/dist/tween.umd.js', 'TWEEN'),
                Autodesk.Viewing.Private.theResourceLoader.loadScript('https://cdnjs.cloudflare.com/ajax/libs/jquery/3.3.1/jquery.min.js', '$'),
                Autodesk.Viewing.Private.theResourceLoader.loadScript('https://cdnjs.cloudflare.com/ajax/libs/jstree/3.3.7/jstree.min.js', '$'),
                loadCSS('https://cdnjs.cloudflare.com/ajax/libs/jstree/3.3.7/themes/default/style.min.css'),
                loadCSS('https://cdnjs.cloudflare.com/ajax/libs/jstree/3.3.7/themes/default-dark/style.min.css'),
                this.viewer.loadExtension('Autodesk.BimWalk'),
                this.viewer.loadExtension('Autodesk.ADN.CameraTweenTool')
            ]);

            this.viewer.setBimWalkToolPopup(false);
            this.cameraTweenTool = this.viewer.getExtension('Autodesk.ADN.CameraTweenTool');

            console.log('MoveToRoomExtension has been loaded.');
            return true;
        }

        async unload() {
            this.viewer.unloadExtension('Autodesk.ADN.CameraTweenTool');
            this.viewer.setBimWalkToolPopup(true);

            delete this.cameraTweenTool;
            this.cameraTweenTool = null;

            console.log('MoveToRoomExtension has been unloaded.');
            return true;
        }
    }

    Autodesk.Viewing.theExtensionManager.registerExtension('Autodesk.ADN.MoveToRoomExtension', MoveToRoomExtension);
})();