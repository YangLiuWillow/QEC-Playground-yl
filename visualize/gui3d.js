// 3d related apis

import * as THREE from 'three'
import { OrbitControls } from './node_modules/three/examples/jsm/controls/OrbitControls.js'
import { ConvexGeometry } from './node_modules/three/examples/jsm/geometries/ConvexGeometry.js'
import Stats from './node_modules/three/examples/jsm/libs/stats.module.js'
import GUI from './node_modules/three/examples/jsm/libs/lil-gui.module.min.js'


if (typeof window === 'undefined' || typeof document === 'undefined') {
    global.THREE = THREE
    global.mocker = await import('./mocker.js')
}

// to work both in browser and nodejs
if (typeof Vue === 'undefined') {
    global.Vue = await import('vue')
}
const { ref, reactive, watch, computed } = Vue

const urlParams = new URLSearchParams(window.location.search)
export const root = document.documentElement

export const is_mock = typeof mockgl !== 'undefined'
export const webgl_renderer_context = is_mock ? mockgl : () => undefined

export const window_inner_width = ref(0)
export const window_inner_height = ref(0)
function on_resize() {
    window_inner_width.value = window.innerWidth
    window_inner_height.value = window.innerHeight
}
on_resize()
window.addEventListener('resize', on_resize)
window.addEventListener('orientationchange', on_resize)

export const sizes = reactive({
    control_bar_width: 0,
    canvas_width: 0,
    canvas_height: 0,
    scale: 1,
})

watch([window_inner_width, window_inner_height], () => {
    sizes.scale = window_inner_width.value / 1920
    if (sizes.scale > window_inner_height.value / 1080) {  // ultra-wide
        sizes.scale = window_inner_height.value / 1080
    }
    if (sizes.scale < 0.5) {
        sizes.scale = 0.5
    }
    if (window_inner_width.value * 0.9 < 300) {
        sizes.scale = window_inner_width.value / 600 * 0.9
    }
    root.style.setProperty('--s', sizes.scale)
    // sizes.scale = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--s'))
    sizes.control_bar_width = 600 * sizes.scale
    sizes.canvas_width = window_inner_width.value - sizes.control_bar_width
    sizes.canvas_height = window_inner_height.value
}, { immediate: true })
if (is_mock) {
    sizes.canvas_width = mocker.mock_canvas_width
    sizes.canvas_height = mocker.mock_canvas_height
}

export const scene = new THREE.Scene()
scene.background = new THREE.Color( 0xffffff )  // for better image output
scene.add( new THREE.AmbientLight( 0xffffff ) )
window.scene = scene
export const perspective_camera = new THREE.PerspectiveCamera( 75, sizes.canvas_width / sizes.canvas_height, 0.1, 10000 )
const orthogonal_camera_init_scale = 6
export const orthogonal_camera = new THREE.OrthographicCamera( sizes.canvas_width / sizes.canvas_height * (-orthogonal_camera_init_scale)
    , sizes.canvas_width / sizes.canvas_height * orthogonal_camera_init_scale, orthogonal_camera_init_scale, -orthogonal_camera_init_scale, 0.1, 100000 )
export const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, context: webgl_renderer_context() })

document.body.appendChild( renderer.domElement )

watch(sizes, () => {
    perspective_camera.aspect = sizes.canvas_width / sizes.canvas_height
    perspective_camera.updateProjectionMatrix()
    orthogonal_camera.left = sizes.canvas_width / sizes.canvas_height * (-orthogonal_camera_init_scale)
    orthogonal_camera.right = sizes.canvas_width / sizes.canvas_height * (orthogonal_camera_init_scale)
    orthogonal_camera.updateProjectionMatrix()
    renderer.setSize( sizes.canvas_width, sizes.canvas_height, false )
    const ratio = window.devicePixelRatio  // looks better on devices with a high pixel ratio, such as iPhones with Retina displays
    renderer.setPixelRatio( ratio )
    const canvas = renderer.domElement
    canvas.width = sizes.canvas_width * ratio
    canvas.height = sizes.canvas_height * ratio
    canvas.style.width = `${sizes.canvas_width}px`
    canvas.style.height = `${sizes.canvas_height}px`
}, { immediate: true })

export const orbit_control_perspective = new OrbitControls( perspective_camera, renderer.domElement )
export const orbit_control_orthogonal = new OrbitControls( orthogonal_camera, renderer.domElement )
export const enable_control = ref(true)
watch(enable_control, (enabled) => {
    orbit_control_perspective.enabled = enabled
    orbit_control_orthogonal.enabled = enabled
}, { immediate: true })
window.enable_control = enable_control

export const use_perspective_camera = ref(false)
export const camera = computed(() => {
    return use_perspective_camera.value ? perspective_camera : orthogonal_camera
})
window.camera = camera
export const orbit_control = computed(() => {
    return use_perspective_camera.value ? orbit_control_perspective : orbit_control_orthogonal
})

export function reset_camera_position(direction="top") {
    for (let [camera, control, distance] of [[perspective_camera, orbit_control_perspective, 8], [orthogonal_camera, orbit_control_orthogonal, 1000]]) {
        control.reset()
        camera.position.x = (direction == "left" ? -distance : 0)
        camera.position.y = (direction == "top" ? distance : 0)
        camera.position.z = (direction == "front" ? distance : 0)
        camera.lookAt(0, 0, 0)
    }
}
reset_camera_position()

// const axesHelper = new THREE.AxesHelper( 5 )
// scene.add( axesHelper )

var stats
export const show_stats = ref(false)
if (!is_mock) {
    stats = Stats()
    document.body.appendChild(stats.dom)
    watch(show_stats, function() {
        if (show_stats.value) {
            stats.dom.style.display = "block"
        } else {
            stats.dom.style.display = "none"
        }
    }, { immediate: true })
    watch(sizes, () => {
        stats.dom.style.transform = `scale(${sizes.scale})`
        stats.dom.style["transform-origin"] = "left top"
    }, { immediate: true })
}

export function animate() {
    requestAnimationFrame( animate )
    orbit_control.value.update()
    renderer.render( scene, camera.value )
    if (stats) stats.update()
}

// commonly used vectors
const zero_vector = new THREE.Vector3( 0, 0, 0 )
const unit_up_vector = new THREE.Vector3( 0, 1, 0 )

// create common geometries
const segment = parseInt(urlParams.get('segment') || 128)  // higher segment will consume more GPU resources
const qubit_radius = parseFloat(urlParams.get('qubit_radius') || 0.15)
export const qubit_radius_scale = ref(1)
const scaled_qubit_radius = computed(() => {
    return qubit_radius * qubit_radius_scale.value
})
const qubit_geometry = new THREE.SphereGeometry( qubit_radius, segment, segment )
const idle_gate_radius = parseFloat(urlParams.get('idle_gate_radius') || 0.025)
const idle_gate_radius_scale = ref(1)
const scaled_idle_gate_radius = computed(() => {
    return idle_gate_radius * idle_gate_radius_scale.value
})
const idle_gate_geometry = new THREE.CylinderGeometry( idle_gate_radius, idle_gate_radius, 1, segment, 1, true )
idle_gate_geometry.translate(0, 0.5, 0)
const initialization_geometry = new THREE.ConeBufferGeometry( 0.1, 0.15, 32 )
const control_qubit_geometry = new THREE.SphereBufferGeometry( 0.05, 12, 6 )
const control_line_radius = 0.02
const control_line_geometry = new THREE.CylinderGeometry( control_line_radius, control_line_radius, 1, segment, 1, true )
control_line_geometry.translate(0, 0.5, 0)
const CX_target_radius = 0.15
const CX_target_geometries = [
    new THREE.TorusBufferGeometry( CX_target_radius, control_line_radius, 16, 32 ),
    new THREE.CylinderBufferGeometry( control_line_radius, control_line_radius, 2 * CX_target_radius, 6 ),
    new THREE.CylinderBufferGeometry( control_line_radius, control_line_radius, 2 * CX_target_radius, 6 ),
]
CX_target_geometries[0].rotateX(Math.PI / 2)
CX_target_geometries[1].rotateX(Math.PI / 2)
CX_target_geometries[2].rotateZ(Math.PI / 2)
const CY_target_radius = 0.15
const CY_target_Y_length = 0.1
const CY_target_geometries = [
    new THREE.TorusBufferGeometry( CY_target_radius, control_line_radius, 16, 4 ),
    new THREE.CylinderBufferGeometry( control_line_radius, control_line_radius, CY_target_Y_length, 6 ),
    new THREE.CylinderBufferGeometry( control_line_radius, control_line_radius, CY_target_Y_length, 6 ),
    new THREE.CylinderBufferGeometry( control_line_radius, control_line_radius, CY_target_Y_length, 6 ),
]
CY_target_geometries[0].rotateX(Math.PI / 2)
CY_target_geometries[0].rotateY(Math.PI / 4)
CY_target_geometries[1].translate(0, CY_target_Y_length/2, 0)
CY_target_geometries[2].translate(0, CY_target_Y_length/2, 0)
CY_target_geometries[3].translate(0, CY_target_Y_length/2, 0)
CY_target_geometries[1].rotateX(Math.PI / 2)
CY_target_geometries[1].rotateY(- 5 * Math.PI / 6)
CY_target_geometries[2].rotateX(Math.PI / 2)
CY_target_geometries[2].rotateY(5 * Math.PI / 6)
CY_target_geometries[3].rotateX(Math.PI / 2)

// measurement bits
const measurement_radius = parseFloat(urlParams.get('measurement_radius') || 0.06)
export const measurement_radius_scale = ref(1)
const scaled_measurement_radius = computed(() => {
    return measurement_radius * measurement_radius_scale.value
})
const measurement_geometry = new THREE.SphereGeometry( measurement_radius, segment, segment )
const defect_measurement_radius = parseFloat(urlParams.get('defect_measurement_radius') || 0.1)
export const defect_measurement_radius_scale = ref(1)
const scaled_defect_measurement_radius = computed(() => {
    return defect_measurement_radius * defect_measurement_radius_scale.value
})
const defect_measurement_geometry = new THREE.SphereGeometry( defect_measurement_radius, segment, segment )

// create common materials
function build_solid_material(color) {
    return new THREE.MeshStandardMaterial({
        color: color,
        opacity: 1,
        transparent: true,
        side: THREE.FrontSide,
    })
}
export const const_color = {
    "X": 0x00CC00,
    "Z": 0x00C0FF,
    "Y": 0xF5B042,
}
export const qubit_materials = {
    "Data": build_solid_material(0x000000),
    "StabX": build_solid_material(const_color.X),
    "StabZ": build_solid_material(const_color.Z),
    "StabXZZXLogicalX": build_solid_material(0xF4CCCC),
    "StabXZZXLogicalZ": build_solid_material(0xF4CCCC),
    "StabY": build_solid_material(const_color.Y),
    "Unknown": build_solid_material(0xFF0000),
}
export function get_qubit_material(qubit_type) {
    const qubit_material = qubit_materials[qubit_type]
    if (qubit_material == null) {
        console.error(`unknown qubit_type: ${qubit_type}`)
        return qubit_materials["Unknown"]
    }
    return qubit_material
}
export const gate_materials = {
    "InitializeZ": build_solid_material(const_color.Z),
    "InitializeX": build_solid_material(const_color.X),
    "CXGateControl": build_solid_material(0x000000),
    "CXGateTarget": build_solid_material(0x000000),
    "CYGateControl": build_solid_material(0x000000),
    "CYGateTarget": build_solid_material(0x000000),
    "CZGate": build_solid_material(0x000000),
    "MeasureZ": build_solid_material(const_color.Z),
    "MeasureX": build_solid_material(const_color.X),
    "Unknown": build_solid_material(0xFF0000),
}
export function get_gate_material(gate_type) {
    const gate_material = gate_materials[gate_type]
    if (gate_material == null) {
        console.error(`unknown qubit_type: ${qubit_type}`)
        return gate_materials["Unknown"]
    }
    return gate_material
}
export const idle_gate_material = new THREE.MeshStandardMaterial({
    color: 0x000000,
    opacity: 0.1,
    transparent: true,
    side: THREE.FrontSide,
})
export const measurement_material = new THREE.MeshStandardMaterial({
    color: 0x000055,
    opacity: 1,
    transparent: true,
    side: THREE.FrontSide,
})
export const virtual_measurement_material = new THREE.MeshStandardMaterial({
    color: 0xFFFF00,
    opacity: 0.5,
    transparent: true,
    side: THREE.FrontSide,
})
export const defect_measurement_material = new THREE.MeshStandardMaterial({
    color: 0xFF0000,
    opacity: 1,
    transparent: true,
    side: THREE.FrontSide,
})
function build_outline_material(color) {
    return new THREE.MeshStandardMaterial({
        color: color,
        opacity: 1,
        transparent: true,
        side: THREE.BackSide,
    })
}
export const qubit_outline_material = build_outline_material(0x000000)
export const measurement_outline_material = build_outline_material(0x000000)
export const virtual_measurement_outline_material = build_outline_material(0x000000)
export const defect_measurement_outline_material = build_outline_material(0x000000)
export const hover_material = new THREE.MeshStandardMaterial({  // when mouse is on this object (vertex or edge)
    color: 0x6FDFDF,
    side: THREE.DoubleSide,
})
export const selected_material = new THREE.MeshStandardMaterial({  // when mouse is on this object (vertex or edge)
    color: 0x4B7BE5,
    side: THREE.DoubleSide,
})

// meshes that can be reused across different cases
export var qubit_meshes = []
window.qubit_meshes = qubit_meshes
export const outline_ratio = ref(1.2)
export var qubit_outline_meshes = []
window.qubit_outline_meshes = qubit_outline_meshes
const scaled_qubit_outline_radius = computed(() => {
    return scaled_qubit_radius.value * outline_ratio.value
})
export var measurement_outline_meshes = []

export var idle_gate_meshes = []
window.idle_gate_meshes = idle_gate_meshes
export var gate_vec_meshes = []
window.gate_vec_meshes = gate_vec_meshes

// update the sizes of objects
watch(qubit_radius_scale, (newVal, oldVal) => {
    qubit_geometry.scale(1/oldVal, 1/oldVal, 1/oldVal)
    qubit_geometry.scale(newVal, newVal, newVal)
})
watch(idle_gate_radius_scale, (newVal, oldVal) => {
    idle_gate_geometry.scale(1/oldVal, 1, 1/oldVal)
    idle_gate_geometry.scale(newVal, 1, newVal)
})
function update_mesh_outline(mesh) {
    mesh.scale.x = outline_ratio.value
    mesh.scale.y = outline_ratio.value
    mesh.scale.z = outline_ratio.value
}
watch([outline_ratio, measurement_radius_scale], () => {
    for (let mesh of measurement_outline_meshes) {
        update_mesh_outline(mesh)
    }
})

// helper functions
export function compute_vector3(data_position) {
    let vector = new THREE.Vector3( 0, 0, 0 )
    load_position(vector, data_position)
    return vector
}
export const t_scale = 1/3
export function load_position(mesh_position, data_position) {
    mesh_position.z = data_position.x
    mesh_position.x = data_position.y
    mesh_position.y = data_position.t * t_scale
}

function build_2d_array(vertical, horizontal, value=(i,j)=>null) {
    let array = []
    for (let i=0; i<vertical; ++i) {
        let row = []
        for (let j=0; j<horizontal; ++j) {
            row.push(value(i,j))
        }
        array.push(row)
    }
    return array
}

function dispose_mesh_2d_array(array) {
    for (let row of array) {
        for (let mesh of row) {
            if (mesh != null) {
                scene.remove( mesh )
                mesh.dispose()
            }
        }
    }
}

function build_3d_array(height, vertical, horizontal, value=(t,i,j)=>null) {
    let array = []
    for (let t=0; t<height; ++t) {
        let layer = []
        for (let i=0; i<vertical; ++i) {
            let row = []
            for (let j=0; j<horizontal; ++j) {
                row.push(value(t,i,j))
            }
            layer.push(row)
        }
        array.push(layer)
    }
    return array
}

function dispose_mesh_3d_array(array) {
    for (let layer of array) {
        for (let row of layer) {
            for (let mesh of row) {
                if (mesh != null) {
                    if (Array.isArray(mesh)) {
                        for (let sub_mesh of mesh) {
                            scene.remove( sub_mesh )
                            sub_mesh.dispose()
                        }
                    } else {
                        scene.remove( mesh )
                        mesh.dispose()
                    }
                }
            }
        }
    }
}

function get_position(position_str) {
    const matched_pos = position_str.match(/^\[(\d+)\]\[(\d+)\]\[(\d+)\]$/)
    return {
        t: parseInt(matched_pos[1]),
        i: parseInt(matched_pos[2]),
        j: parseInt(matched_pos[3]),
    }
}

export async function refresh_qecp_data() {
    // console.log("refresh_qecp_data")
    if (active_qecp_data.value != null) {  // no qecp data provided
        const qecp_data = active_qecp_data.value
        const nodes = qecp_data.simulator.nodes
        // clear hover and select
        current_hover.value = null
        let current_selected_value = JSON.parse(JSON.stringify(current_selected.value))
        current_selected.value = null
        await Vue.nextTick()
        await Vue.nextTick()
        // constants
        const height = qecp_data.simulator.height
        const t_bias = -height/2
        const vertical = qecp_data.simulator.vertical
        const horizontal = qecp_data.simulator.horizontal
        // draw qubits at t=-1
        dispose_mesh_2d_array(qubit_meshes)
        dispose_mesh_2d_array(qubit_outline_meshes)
        qubit_meshes = build_2d_array(vertical, horizontal)
        qubit_outline_meshes = build_2d_array(vertical, horizontal)
        for (let i=0; i<vertical; ++i) {
            for (let j=0; j<horizontal; ++j) {
                const qubit = nodes[0][i][j]
                if (qubit != null && !qubit.v) {
                    const position = qecp_data.simulator.positions[i][j]
                    const display_position = {
                        t: -1 + t_bias,
                        x: position.x,
                        y: position.y,
                    }
                    // qubit
                    const qubit_material = get_qubit_material(qubit.q)
                    const qubit_mesh = new THREE.Mesh( qubit_geometry, qubit_material )
                    qubit_mesh.userData = {
                        type: "qubit",
                        i: i,
                        j: j,
                    }
                    scene.add( qubit_mesh )
                    load_position(qubit_mesh.position, display_position)
                    qubit_meshes[i][j] = qubit_mesh
                    qubit_mesh.visible = true
                    // qubit outline
                    const qubit_outline_mesh = new THREE.Mesh( qubit_geometry, qubit_outline_material )
                    load_position(qubit_outline_mesh.position, display_position,)
                    update_mesh_outline(qubit_outline_mesh)
                    scene.add( qubit_outline_mesh )
                    qubit_outline_meshes[i][j] = qubit_outline_mesh
                }
            }
        }
        // draw idle gates
        dispose_mesh_3d_array(idle_gate_meshes)
        idle_gate_meshes = build_3d_array(height, vertical, horizontal)
        for (let t=0; t<height; ++t) {
            for (let i=0; i<vertical; ++i) {
                for (let j=0; j<horizontal; ++j) {
                    const node = nodes[t][i][j]
                    if (node != null && !node.v && !(node.gt == "InitializeX" || node.gt == "InitializeZ")) {
                        const position = qecp_data.simulator.positions[i][j]
                        const display_position = {
                            t: t-1 + t_bias,  // idle gate is before every real gate
                            x: position.x,
                            y: position.y,
                        }
                        const idle_gate_mesh = new THREE.Mesh( idle_gate_geometry, idle_gate_material )
                        idle_gate_mesh.userData = {
                            type: "idle_gate",
                            t: t,
                            i: i,
                            j: j,
                        }
                        load_position(idle_gate_mesh.position, display_position)
                        idle_gate_mesh.scale.set(1, t_scale, 1)
                        scene.add( idle_gate_mesh )
                        idle_gate_meshes[t][i][j] = idle_gate_mesh
                    }
                }
            }
        }
        // draw gates
        dispose_mesh_3d_array(gate_vec_meshes)
        gate_vec_meshes = build_3d_array(height, vertical, horizontal)
        for (let t=0; t<height; ++t) {
            for (let i=0; i<vertical; ++i) {
                for (let j=0; j<horizontal; ++j) {
                    const node = nodes[t][i][j]
                    if (node != null && !node.v && !node.pv && node.gt != "None") {
                        const gate_material = get_gate_material(node.gt)
                        const position = qecp_data.simulator.positions[i][j]
                        const display_position = { t: t + t_bias, x: position.x, y: position.y }
                        const gate_vec_mesh = []
                        gate_vec_meshes[t][i][j] = gate_vec_mesh
                        if (node.gt == "InitializeX" || node.gt == "InitializeZ") {
                            const gate_mesh = new THREE.Mesh( initialization_geometry, gate_material )
                            load_position(gate_mesh.position, display_position)
                            scene.add( gate_mesh )
                            gate_vec_mesh.push(gate_mesh)
                        } else if (node.gt == "MeasureX" || node.gt == "MeasureZ") {
                            const gate_mesh = new THREE.Mesh( measurement_geometry, gate_material )
                            load_position(gate_mesh.position, display_position)
                            scene.add( gate_mesh )
                            gate_vec_mesh.push(gate_mesh)
                        } else if (node.gt == "CXGateControl" || node.gt == "CYGateControl" || node.gt == "CZGate") {
                            // dot
                            const dot_mesh = new THREE.Mesh( control_qubit_geometry, gate_material )
                            load_position(dot_mesh.position, display_position)
                            scene.add( dot_mesh )
                            gate_vec_mesh.push(dot_mesh)
                            // line
                            const peer = get_position(node.gp)
                            const peer_position = qecp_data.simulator.positions[peer.i][peer.j]
                            const peer_display_position = { t: t + t_bias, x: peer_position.x, y: peer_position.y }
                            const line_mesh = new THREE.Mesh( control_line_geometry, gate_material )
                            const relative = compute_vector3(peer_display_position).add(compute_vector3(display_position).multiplyScalar(-1))
                            const direction = relative.clone().normalize()
                            const quaternion = new THREE.Quaternion()
                            quaternion.setFromUnitVectors(unit_up_vector, direction)
                            load_position(line_mesh.position, display_position)
                            line_mesh.scale.set(1, relative.length() / 2, 1)
                            line_mesh.setRotationFromQuaternion(quaternion)
                            scene.add( line_mesh )
                            gate_vec_mesh.push(line_mesh)
                        } else if (node.gt == "CXGateTarget") {
                            // X gate
                            for (let k=0; k < CX_target_geometries.length; ++k) {
                                const geometry = CX_target_geometries[k]
                                let mesh = new THREE.Mesh(geometry, gate_material)
                                load_position(mesh.position, display_position)
                                scene.add( mesh )
                                gate_vec_mesh.push(mesh)
                            }
                            // line
                            const peer = get_position(node.gp)
                            const peer_position = qecp_data.simulator.positions[peer.i][peer.j]
                            const peer_display_position = { t: t + t_bias, x: peer_position.x, y: peer_position.y }
                            const line_mesh = new THREE.Mesh( control_line_geometry, gate_material )
                            const relative = compute_vector3(peer_display_position).add(compute_vector3(display_position).multiplyScalar(-1))
                            const direction = relative.clone().normalize()
                            const quaternion = new THREE.Quaternion()
                            quaternion.setFromUnitVectors(unit_up_vector, direction)
                            load_position(line_mesh.position, display_position)
                            line_mesh.scale.set(1, relative.length() / 2, 1)
                            line_mesh.setRotationFromQuaternion(quaternion)
                            scene.add( line_mesh )
                            gate_vec_mesh.push(line_mesh)
                        } else if (node.gt == "CYGateTarget") {
                            // Y gate
                            for (let k=0; k < CY_target_geometries.length; ++k) {
                                const geometry = CY_target_geometries[k]
                                let mesh = new THREE.Mesh(geometry, gate_material)
                                load_position(mesh.position, display_position)
                                scene.add( mesh )
                                gate_vec_mesh.push(mesh)
                            }
                            // line
                            const peer = get_position(node.gp)
                            const peer_position = qecp_data.simulator.positions[peer.i][peer.j]
                            const peer_display_position = { t: t + t_bias, x: peer_position.x, y: peer_position.y }
                            const relative = compute_vector3(peer_display_position).add(compute_vector3(display_position).multiplyScalar(-1))
                            const direction = relative.clone().normalize()
                            const quaternion = new THREE.Quaternion()
                            quaternion.setFromUnitVectors(unit_up_vector, direction)
                            let edge_length = relative.length()/2 - CY_target_radius / Math.sqrt(2)
                            console.log(edge_length)
                            if (edge_length > 0) {
                                const biased_position = compute_vector3(display_position)
                                    .add(relative.clone().multiplyScalar((relative.length()/2 - edge_length) / relative.length()))
                                // console.log(compute_vector3(display_position), biased_display_position)
                                const line_mesh = new THREE.Mesh( control_line_geometry, gate_material )
                                line_mesh.position.copy(biased_position)
                                line_mesh.scale.set(1, edge_length, 1)
                                line_mesh.setRotationFromQuaternion(quaternion)
                                scene.add( line_mesh )
                                gate_vec_mesh.push(line_mesh)
                            }
                        } else {
                            console.error(`unknown gate_type: ${node.gt}`)
                        }
                    }
                }
            }
        }
        // refresh case as well
        await refresh_case()
    }
}

export const active_qecp_data = ref(null)
export const active_case_idx = ref(0)
export async function refresh_case() {
    // console.log("refresh_case")
    if (active_qecp_data.value != null) {  // no qecp data provided
        const qecp_data = active_qecp_data.value
        const case_idx = active_case_idx.value
        const active_case = qecp_data.cases[case_idx]
        // clear hover and select
        current_hover.value = null
        let current_selected_value = JSON.parse(JSON.stringify(current_selected.value))
        current_selected.value = null
        await Vue.nextTick()
        await Vue.nextTick()
        
        return
        // draw vertices
        let subgraph_set = {}
        if (active_case.subgraph != null) {
            for (let edge_index of active_case.subgraph) {
                subgraph_set[edge_index] = true
            }
        }
        for (let [i, vertex] of active_case.vertices.entries()) {
            if (vertex == null) {
                if (i < vertex_meshes.length) {  // hide
                    vertex_meshes[i].visible = false
                }
                continue
            }
            let position = qecp_data.positions[i]
            while (vertex_meshes.length <= i) {
                const vertex_mesh = new THREE.Mesh( vertex_geometry, real_vertex_material )
                vertex_mesh.visible = false
                vertex_mesh.userData = {
                    type: "vertex",
                    vertex_index: vertex_meshes.length,
                }
                scene.add( vertex_mesh )
                vertex_meshes.push(vertex_mesh)
            }
            const vertex_mesh = vertex_meshes[i]
            load_position(vertex_mesh.position, position)
            if (vertex.mi != null && vertex.me == 0) {
                vertex_mesh.material = disabled_mirror_vertex_material
            } else if (vertex.s) {
                vertex_mesh.material = defect_vertex_material
            } else if (vertex.v) {
                vertex_mesh.material = virtual_vertex_material
            } else {
                vertex_mesh.material = real_vertex_material
            }
            vertex_mesh.visible = true
        }
        for (let i = active_case.vertices.length; i < vertex_meshes.length; ++i) {
            vertex_meshes[i].visible = false
        }
        // draw edges
        let edge_offset = 0
        if (scaled_edge_radius.value < scaled_vertex_outline_radius.value) {
            edge_offset = Math.sqrt(Math.pow(scaled_vertex_outline_radius.value, 2) - Math.pow(scaled_edge_radius.value, 2))
        }
        edge_caches = []  // clear cache
        for (let [i, edge] of active_case.edges.entries()) {
            if (edge == null) {
                if (i < left_edge_meshes.length) {  // hide
                    for (let j of [0, 1]) {
                        left_edge_meshes[i][j].visible = false
                        right_edge_meshes[i][j].visible = false
                        middle_edge_meshes[i][j].visible = false
                    }
                }
                continue
            }
            const left_position = qecp_data.positions[edge.l]
            const right_position = qecp_data.positions[edge.r]
            const relative = compute_vector3(right_position).add(compute_vector3(left_position).multiplyScalar(-1))
            const direction = relative.clone().normalize()
            // console.log(direction)
            const quaternion = new THREE.Quaternion()
            quaternion.setFromUnitVectors(unit_up_vector, direction)
            const reverse_quaternion = new THREE.Quaternion()
            reverse_quaternion.setFromUnitVectors(unit_up_vector, direction.clone().multiplyScalar(-1))
            let local_edge_offset = edge_offset
            const distance = relative.length()
            let edge_length = distance - 2 * edge_offset
            if (edge_length < 0) {  // edge length should be non-negative
                local_edge_offset = distance / 2
                edge_length = 0
            }
            const left_start = local_edge_offset
            const [left_grown, right_grown] = translate_edge(edge.lg, edge.rg, edge.w)
            let left_end = local_edge_offset + edge_length * (edge.w == 0 ? 0.5 : (left_grown / edge.w))  // always show 0-weight edge as fully-grown
            let right_end = local_edge_offset + edge_length * (edge.w == 0 ? 0.5 : (edge.w - right_grown) / edge.w)  // always show 0-weight edge as fully-grown
            const right_start = local_edge_offset + edge_length
            edge_caches.push({
                position: {
                    left_start: compute_vector3(left_position).add(relative.clone().multiplyScalar(left_start / distance)),
                    left_end: compute_vector3(left_position).add(relative.clone().multiplyScalar(left_end / distance)),
                    right_end: compute_vector3(left_position).add(relative.clone().multiplyScalar(right_end / distance)),
                    right_start: compute_vector3(left_position).add(relative.clone().multiplyScalar(right_start / distance)),
                }
            })
            // console.log(`${left_start}, ${left_end}, ${right_end}, ${right_start}`)
            for (let [start, end, edge_meshes, is_grown_part] of [[left_start, left_end, left_edge_meshes, true], [left_end, right_end, middle_edge_meshes, false]
                    , [right_end, right_start, right_edge_meshes, true]]) {
                while (edge_meshes.length <= i) {
                    let two_edges = [null, null]
                    for (let j of [0, 1]) {
                        const edge_mesh = new THREE.Mesh( edge_geometry, edge_material )
                        edge_mesh.userData = {
                            type: "edge",
                            edge_index: edge_meshes.length,
                        }
                        edge_mesh.visible = false
                        scene.add( edge_mesh )
                        two_edges[j] = edge_mesh
                    }
                    edge_meshes.push(two_edges)
                }
                const start_position = compute_vector3(left_position).add(relative.clone().multiplyScalar(start / distance))
                const end_position = compute_vector3(left_position).add(relative.clone().multiplyScalar(end / distance))
                for (let j of [0, 1]) {
                    const edge_mesh = edge_meshes[i][j]
                    edge_mesh.position.copy(j == 0 ? start_position : end_position)
                    edge_mesh.scale.set(1, (end - start) / 2, 1)
                    edge_mesh.setRotationFromQuaternion(j == 0 ? quaternion : reverse_quaternion)
                    edge_mesh.visible = true
                    if (start >= end) {
                        edge_mesh.visible = false
                    }
                    edge_mesh.material = is_grown_part ? grown_edge_material : edge_material
                    if (active_case.subgraph != null) {
                        edge_mesh.material = edge_material  // do not display grown edges
                    }
                    if (subgraph_set[i]) {
                        edge_mesh.material = subgraph_edge_material
                    }
                }
            }
        }
        for (let i = active_case.edges.length; i < left_edge_meshes.length; ++i) {
            for (let j of [0, 1]) {
                left_edge_meshes[i][j].visible = false
                right_edge_meshes[i][j].visible = false
                middle_edge_meshes[i][j].visible = false
            }
        }
        // draw vertex outlines
        for (let [i, vertex] of active_case.vertices.entries()) {
            if (vertex == null) {
                if (i < vertex_outline_meshes.length) {  // hide
                    vertex_outline_meshes[i].visible = false
                }
                continue
            }
            let position = qecp_data.positions[i]
            while (vertex_outline_meshes.length <= i) {
                const vertex_outline_mesh = new THREE.Mesh( vertex_geometry, real_vertex_outline_material )
                vertex_outline_mesh.visible = false
                update_mesh_outline(vertex_outline_mesh)
                scene.add( vertex_outline_mesh )
                vertex_outline_meshes.push(vertex_outline_mesh)
            }
            const vertex_outline_mesh = vertex_outline_meshes[i]
            load_position(vertex_outline_mesh.position, position)
            if (vertex.s) {
                vertex_outline_mesh.material = defect_vertex_outline_material
            } else if (vertex.v) {
                vertex_outline_mesh.material = virtual_vertex_outline_material
            } else {
                vertex_outline_mesh.material = real_vertex_outline_material
            }
            vertex_outline_mesh.visible = true
        }
        for (let i = active_case.vertices.length; i < vertex_meshes.length; ++i) {
            vertex_outline_meshes[i].visible = false
        }
        // draw convex
        for (let blossom_convex_mesh of blossom_convex_meshes) {
            scene.remove( blossom_convex_mesh )
            blossom_convex_mesh.geometry.dispose()
        }
        for (let [i, dual_node] of active_case.dual_nodes.entries()) {
            if (dual_node == null) { continue }
            if (active_case.subgraph != null) { continue }  // do not display convex if subgraph is displayed
            // for child node in a blossom, this will not display properly; we should avoid plotting child nodes
            let display_node = dual_node.p == null && (dual_node.d > 0 || dual_node.o != null)
            if (display_node) {  // no parent and (positive dual variable or it's a blossom)
                let points = []
                if (dual_node.b != null) {
                    for (let [is_left, edge_index] of dual_node.b) {
                        let cached_position = edge_caches[edge_index].position
                        const edge = active_case.edges[edge_index]
                        if (edge.ld == edge.rd && edge.lg + edge.rg >= edge.w) {
                            continue  // do not draw this edge, this is an internal edge
                        }
                        if (is_left) {
                            if (edge.lg == edge.w) {
                                points.push(vertex_caches[edge.r].position.center.clone())
                            } else if (edge.lg == 0) {
                                points.push(vertex_caches[edge.l].position.center.clone())
                            } else {
                                points.push(cached_position.left_end.clone())
                            }
                        } else {
                            if (edge.rg == edge.w) {
                                points.push(vertex_caches[edge.l].position.center.clone())
                            } else if (edge.rg == 0) {
                                points.push(vertex_caches[edge.r].position.center.clone())
                            } else {
                                points.push(cached_position.right_end.clone())
                            }
                        }
                    }
                }
                if (points.length >= 3) {  // only display if points is more than 3
                    if (window.is_vertices_2d_plane) {
                        // special optimization for 2D points, because ConvexGeometry doesn't work well on them
                        const points_2d = []
                        for (let point of points) {
                            points_2d.push([ point.x, point.z ])
                        }
                        const hull_points = hull(points_2d, 1)
                        const shape_points = []
                        for (let hull_point of hull_points) {
                            shape_points.push( new THREE.Vector2( hull_point[0], hull_point[1] ) );
                        }
                        const shape = new THREE.Shape( shape_points )
                        const geometry = new THREE.ShapeGeometry( shape )
                        const blossom_convex_mesh = new THREE.Mesh( geometry, blossom_convex_material_2d )
                        blossom_convex_mesh.position.set( 0, -0.2, 0 )  // place the plane to slightly below the vertices for better viz
                        blossom_convex_mesh.rotation.set( Math.PI / 2, 0, 0 );
                        scene.add( blossom_convex_mesh )
                        blossom_convex_meshes.push(blossom_convex_mesh)
                    } else {
                        const geometry = new ConvexGeometry( points )
                        const blossom_convex_mesh = new THREE.Mesh( geometry, blossom_convex_material )
                        scene.add( blossom_convex_mesh )
                        blossom_convex_meshes.push(blossom_convex_mesh)
                    }
                }
            }
        }
        // reset select
        await Vue.nextTick()
        if (is_user_data_valid(current_selected_value)) {
            current_selected.value = current_selected_value
        }
    }
}
watch([active_qecp_data], refresh_qecp_data)  // call refresh_case
watch([active_case_idx], refresh_case)
export function show_case(case_idx, qecp_data) {
    active_case_idx.value = case_idx
    active_qecp_data.value = qecp_data
}

// configurations
const gui = new GUI( { width: 400, title: "render configurations" } )
export const show_config = ref(false)
watch(show_config, () => {
    if (show_config.value) {
        gui.domElement.style.display = "block"
    } else {
        gui.domElement.style.display = "none"
    }
}, { immediate: true })
watch(sizes, () => {  // move render configuration GUI to 3D canvas
    // gui.domElement.style.right = sizes.control_bar_width + "px"
    gui.domElement.style.right = 0
}, { immediate: true })
const conf = {
    scene_background: scene.background,
    // defect_vertex_color: defect_vertex_material.color,
    // defect_vertex_opacity: defect_vertex_material.opacity,
    // disabled_mirror_vertex_color: disabled_mirror_vertex_material.color,
    // disabled_mirror_vertex_opacity: disabled_mirror_vertex_material.opacity,
    // real_vertex_color: real_vertex_material.color,
    // real_vertex_opacity: real_vertex_material.opacity,
    // virtual_vertex_color: virtual_vertex_material.color,
    // virtual_vertex_opacity: virtual_vertex_material.opacity,
    // defect_vertex_outline_color: defect_vertex_outline_material.color,
    // defect_vertex_outline_opacity: defect_vertex_outline_material.opacity,
    // real_vertex_outline_color: real_vertex_outline_material.color,
    // real_vertex_outline_opacity: real_vertex_outline_material.opacity,
    // virtual_vertex_outline_color: virtual_vertex_outline_material.color,
    // virtual_vertex_outline_opacity: virtual_vertex_outline_material.opacity,
    // edge_color: edge_material.color,
    // edge_opacity: edge_material.opacity,
    // edge_side: edge_material.side,
    // grown_edge_color: grown_edge_material.color,
    // grown_edge_opacity: grown_edge_material.opacity,
    // grown_edge_side: grown_edge_material.side,
    // subgraph_edge_color: subgraph_edge_material.color,
    // subgraph_edge_opacity: subgraph_edge_material.opacity,
    // subgraph_edge_side: subgraph_edge_material.side,
    // outline_ratio: outline_ratio.value,
    // vertex_radius_scale: vertex_radius_scale.value,
    // edge_radius_scale: edge_radius_scale.value,
}
const side_options = { "FrontSide": THREE.FrontSide, "BackSide": THREE.BackSide, "DoubleSide": THREE.DoubleSide } 
export const controller = {}
window.controller = controller
controller.scene_background = gui.addColor( conf, 'scene_background' ).onChange( function ( value ) { scene.background = value } )
// const vertex_folder = gui.addFolder( 'vertex' )
// controller.defect_vertex_color = vertex_folder.addColor( conf, 'defect_vertex_color' ).onChange( function ( value ) { defect_vertex_material.color = value } )
// controller.defect_vertex_opacity = vertex_folder.add( conf, 'defect_vertex_opacity', 0, 1 ).onChange( function ( value ) { defect_vertex_material.opacity = Number(value) } )
// controller.disabled_mirror_vertex_color = vertex_folder.addColor( conf, 'disabled_mirror_vertex_color' ).onChange( function ( value ) { disabled_mirror_vertex_material.color = value } )
// controller.disabled_mirror_vertex_opacity = vertex_folder.add( conf, 'disabled_mirror_vertex_opacity', 0, 1 ).onChange( function ( value ) { disabled_mirror_vertex_material.opacity = Number(value) } )
// controller.real_vertex_color = vertex_folder.addColor( conf, 'real_vertex_color' ).onChange( function ( value ) { real_vertex_material.color = value } )
// controller.real_vertex_opacity = vertex_folder.add( conf, 'real_vertex_opacity', 0, 1 ).onChange( function ( value ) { real_vertex_material.opacity = Number(value) } )
// controller.virtual_vertex_color = vertex_folder.addColor( conf, 'virtual_vertex_color' ).onChange( function ( value ) { virtual_vertex_material.color = value } )
// controller.virtual_vertex_opacity = vertex_folder.add( conf, 'virtual_vertex_opacity', 0, 1 ).onChange( function ( value ) { virtual_vertex_material.opacity = Number(value) } )
// const vertex_outline_folder = gui.addFolder( 'vertex outline' )
// controller.vertex_outline_color = vertex_outline_folder.addColor( conf, 'defect_vertex_outline_color' ).onChange( function ( value ) { defect_vertex_outline_material.color = value } )
// controller.vertex_outline_opacity = vertex_outline_folder.add( conf, 'defect_vertex_outline_opacity', 0, 1 ).onChange( function ( value ) { defect_vertex_outline_material.opacity = Number(value) } )
// controller.vertex_outline_color = vertex_outline_folder.addColor( conf, 'real_vertex_outline_color' ).onChange( function ( value ) { real_vertex_outline_material.color = value } )
// controller.vertex_outline_opacity = vertex_outline_folder.add( conf, 'real_vertex_outline_opacity', 0, 1 ).onChange( function ( value ) { real_vertex_outline_material.opacity = Number(value) } )
// controller.virtual_vertex_outline_color = vertex_outline_folder.addColor( conf, 'virtual_vertex_outline_color' ).onChange( function ( value ) { virtual_vertex_outline_material.color = value } )
// controller.virtual_vertex_outline_opacity = vertex_outline_folder.add( conf, 'virtual_vertex_outline_opacity', 0, 1 ).onChange( function ( value ) { virtual_vertex_outline_material.opacity = Number(value) } )
// const edge_folder = gui.addFolder( 'edge' )
// controller.edge_color = edge_folder.addColor( conf, 'edge_color' ).onChange( function ( value ) { edge_material.color = value } )
// controller.edge_opacity = edge_folder.add( conf, 'edge_opacity', 0, 1 ).onChange( function ( value ) { edge_material.opacity = Number(value) } )
// controller.edge_side = edge_folder.add( conf, 'edge_side', side_options ).onChange( function ( value ) { edge_material.side = Number(value) } )
// controller.grown_edge_color = edge_folder.addColor( conf, 'grown_edge_color' ).onChange( function ( value ) { grown_edge_material.color = value } )
// controller.grown_edge_opacity = edge_folder.add( conf, 'grown_edge_opacity', 0, 1 ).onChange( function ( value ) { grown_edge_material.opacity = Number(value) } )
// controller.grown_edge_side = edge_folder.add( conf, 'grown_edge_side', side_options ).onChange( function ( value ) { grown_edge_material.side = Number(value) } )
// controller.subgraph_edge_color = edge_folder.addColor( conf, 'subgraph_edge_color' ).onChange( function ( value ) { subgraph_edge_material.color = value } )
// controller.subgraph_edge_opacity = edge_folder.add( conf, 'subgraph_edge_opacity', 0, 1 ).onChange( function ( value ) { subgraph_edge_material.opacity = Number(value) } )
// controller.subgraph_edge_side = edge_folder.add( conf, 'subgraph_edge_side', side_options ).onChange( function ( value ) { subgraph_edge_material.side = Number(value) } )
// const size_folder = gui.addFolder( 'size' )
// controller.outline_ratio = size_folder.add( conf, 'outline_ratio', 0.99, 2 ).onChange( function ( value ) { outline_ratio.value = Number(value) } )
// controller.vertex_radius_scale = size_folder.add( conf, 'vertex_radius_scale', 0.1, 5 ).onChange( function ( value ) { vertex_radius_scale.value = Number(value) } )
// controller.edge_radius_scale = size_folder.add( conf, 'edge_radius_scale', 0.1, 10 ).onChange( function ( value ) { edge_radius_scale.value = Number(value) } )
watch(sizes, () => {
    gui.domElement.style.transform = `scale(${sizes.scale})`
    gui.domElement.style["transform-origin"] = "right top"
}, { immediate: true })

// select logic
const raycaster = new THREE.Raycaster()
const mouse = new THREE.Vector2()
var previous_hover_material = null
export const current_hover = ref(null)
window.current_hover = current_hover
var previous_selected_material = null
export const current_selected = ref(null)
window.current_selected = current_selected
export const show_hover_effect = ref(true)
function is_user_data_valid(user_data) {
    if (user_data == null) return false
    const qecp_data = active_qecp_data.value
    const case_idx = active_case_idx.value
    const active_case = qecp_data.cases[case_idx][1]
    if (user_data.type == "vertex") {
        return user_data.vertex_index < active_case.vertices.length && active_case.vertices[user_data.vertex_index] != null
    }
    if (user_data.type == "edge") {
        return user_data.edge_index < active_case.edges.length && active_case.edges[user_data.edge_index] != null
    }
    return false
}
function set_material_with_user_data(user_data, material) {  // return the previous material
    if (user_data.type == "vertex") {
        let vertex_index = user_data.vertex_index
        let vertex_mesh = vertex_meshes[vertex_index]
        let previous_material = vertex_mesh.material
        vertex_mesh.material = material
        return previous_material
    }
    if (user_data.type == "edge") {
        let expanded_material = material
        if (!Array.isArray(material)) {
            expanded_material = [[material, material], [material, material], [material, material]]
        }
        let edge_index = user_data.edge_index
        let meshes_lists = [left_edge_meshes, right_edge_meshes, middle_edge_meshes]
        let previous_material = [[null,null],[null,null],[null,null]]
        for (let i = 0; i < meshes_lists.length; ++i) {
            let meshes_list = meshes_lists[i][edge_index]
            for (let j of [0, 1]) {
                let edge_mesh = meshes_list[j]
                previous_material[i][j] = edge_mesh.material
                edge_mesh.material = expanded_material[i][j]
            }
        }
        return previous_material
    }
    console.error(`unknown type ${user_data.type}`)
}
watch(current_hover, (newVal, oldVal) => {
    // console.log(`${oldVal} -> ${newVal}`)
    if (oldVal != null && previous_hover_material != null) {
        set_material_with_user_data(oldVal, previous_hover_material)
        previous_hover_material = null
    }
    if (newVal != null) {
        previous_hover_material = set_material_with_user_data(newVal, hover_material)
    }
})
watch(current_selected, (newVal, oldVal) => {
    if (newVal != null) {
        current_hover.value = null
    }
    Vue.nextTick(() => {  // wait after hover cleaned its data
        if (oldVal != null && previous_selected_material != null) {
            set_material_with_user_data(oldVal, previous_selected_material)
            previous_selected_material = null
        }
        if (newVal != null) {
            previous_selected_material = set_material_with_user_data(newVal, selected_material)
        }
    })
})
function on_mouse_change(event, is_click) {
    mouse.x = ( event.clientX / sizes.canvas_width ) * 2 - 1
    mouse.y = - ( event.clientY / sizes.canvas_height ) * 2 + 1
    raycaster.setFromCamera( mouse, camera.value )
    const intersects = raycaster.intersectObjects( scene.children, false )
    for (let intersect of intersects) {
        if (!intersect.object.visible) continue  // don't select invisible object
        let user_data = intersect.object.userData
        if (user_data.type == null) continue  // doesn't contain enough information
        // swap back to the original material
        if (is_click) {
            current_selected.value = user_data
        } else {
            if (show_hover_effect.value) {
                current_hover.value = user_data
            } else {
                current_hover.value = null
            }
        }
        return
    }
    if (is_click) {
        current_selected.value = null
    } else {
        current_hover.value = null
    }
    return
}
var mousedown_position = null
var is_mouse_currently_down = false
window.addEventListener( 'mousedown', (event) => {
    if (event.clientX > sizes.canvas_width) return  // don't care events on control panel
    mousedown_position = {
        clientX: event.clientX,
        clientY: event.clientY,
    }
    is_mouse_currently_down = true
} )
window.addEventListener( 'mouseup', (event) => {
    if (event.clientX > sizes.canvas_width) return  // don't care events on control panel
    // to prevent triggering select while moving camera
    if (mousedown_position != null && mousedown_position.clientX == event.clientX && mousedown_position.clientY == event.clientY) {
        on_mouse_change(event, true)
    }
    is_mouse_currently_down = false
} )
window.addEventListener( 'mousemove', (event) => {
    if (event.clientX > sizes.canvas_width) return  // don't care events on control panel
    // to prevent triggering hover while moving camera
    if (!is_mouse_currently_down) {
        on_mouse_change(event, false)
    }
} )

// export current scene to high-resolution png, useful when generating figures for publication
// (I tried svg renderer but it doesn't work very well... shaders are poorly supported)
export function render_png(scale=1) {
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true, context: webgl_renderer_context() })
    renderer.setSize( sizes.canvas_width * scale, sizes.canvas_height * scale, false )
    renderer.setPixelRatio( window.devicePixelRatio * scale )
    renderer.render( scene, camera.value )
    return renderer.domElement.toDataURL()
}
window.render_png = render_png
export function open_png(data_url) {
    const w = window.open('', '')
    w.document.title = "rendered image"
    w.document.body.style.backgroundColor = "white"
    w.document.body.style.margin = "0"
    const img = new Image()
    img.src = data_url
    img.style = "width: 100%; height: 100%; object-fit: contain;"
    w.document.body.appendChild(img)
}
window.open_png = open_png
export function download_png(data_url) {
    const a = document.createElement('a')
    a.href = data_url.replace("image/png", "image/octet-stream")
    a.download = 'rendered.png'
    a.click()
}
window.download_png = download_png

export async function nodejs_render_png() {  // works only in nodejs
    let context = webgl_renderer_context()
    var pixels = new Uint8Array(context.drawingBufferWidth * context.drawingBufferHeight * 4)
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, preserveDrawingBuffer: true, context })
    renderer.setSize( sizes.canvas_width, sizes.canvas_height, false )
    renderer.setPixelRatio( window.devicePixelRatio )
    renderer.render( scene, camera.value )
    context.readPixels(0, 0, context.drawingBufferWidth, context.drawingBufferHeight, context.RGBA, context.UNSIGNED_BYTE, pixels)
    return pixels
}

// wait several Vue ticks to make sure all changes have been applied
export async function wait_changes() {
    for (let i=0; i<5; ++i) await Vue.nextTick()
}

// https://www.npmjs.com/package/base64-arraybuffer
var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
function base64_encode (arraybuffer) {
    var bytes = new Uint8Array(arraybuffer), i, len = bytes.length, base64 = ''
    for (i = 0; i < len; i += 3) {
        base64 += chars[bytes[i] >> 2]
        base64 += chars[((bytes[i] & 3) << 4) | (bytes[i + 1] >> 4)]
        base64 += chars[((bytes[i + 1] & 15) << 2) | (bytes[i + 2] >> 6)]
        base64 += chars[bytes[i + 2] & 63]
    }
    if (len % 3 === 2) {
        base64 = base64.substring(0, base64.length - 1) + '='
    }
    else if (len % 3 === 1) {
        base64 = base64.substring(0, base64.length - 2) + '=='
    }
    return base64;
}
