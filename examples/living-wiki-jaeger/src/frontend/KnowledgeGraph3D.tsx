import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'

type GraphNode = { slug: string; title: string; degree: number; kind?: string }
type GraphEdge = { from?: string; to?: string; source?: string; target?: string; id?: string; kind?: string; weight?: number }
type GraphHighlight = { nodeIds: string[]; edgeIds: string[]; kind: string; label: string }

export default function KnowledgeGraph3D(props: { nodes: GraphNode[]; edges: GraphEdge[]; highlights?: GraphHighlight[]; onSelect?: (slug: string) => void }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const highlightedNodeIds = useMemo(() => new Set((props.highlights ?? []).flatMap((highlight) => highlight.nodeIds.map(stripGraphPrefix))), [props.highlights])
  const graph = useMemo(() => layoutGraph(props.nodes, props.edges), [props.nodes, props.edges])
  const onSelect = props.onSelect

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(host.clientWidth, host.clientHeight)
    host.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, host.clientWidth / Math.max(host.clientHeight, 1), 0.1, 100)
    camera.position.set(0, 0, 12)

    const group = new THREE.Group()
    scene.add(group)
    scene.add(new THREE.AmbientLight(0xffffff, 1.4))
    const light = new THREE.PointLight(0xffffff, 2.8)
    light.position.set(3, 4, 6)
    scene.add(light)

    const nodeMeshes: Array<{ slug: string; mesh: THREE.Mesh }> = []
    const material = new THREE.MeshStandardMaterial({ color: 0xd8dde5, roughness: 0.42, metalness: 0.1 })
    const hubMaterial = new THREE.MeshStandardMaterial({ color: 0x5fbf8f, roughness: 0.35, metalness: 0.12 })
    const sourceMaterial = new THREE.MeshStandardMaterial({ color: 0x7fb3d5, roughness: 0.38, metalness: 0.08 })
    const artifactMaterial = new THREE.MeshStandardMaterial({ color: 0xd7b46a, roughness: 0.35, metalness: 0.12 })
    const highlightMaterial = new THREE.MeshStandardMaterial({ color: 0xff7a59, roughness: 0.28, metalness: 0.16, emissive: 0x3b1209 })
    const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x68717d, transparent: true, opacity: 0.42 })
    const highlightEdgeMaterial = new THREE.LineBasicMaterial({ color: 0xff9f6e, transparent: true, opacity: 0.76 })

    for (const edge of graph.edges) {
      const source = graph.positions.get(edge.from)
      const target = graph.positions.get(edge.to)
      if (!source || !target) continue
      const geometry = new THREE.BufferGeometry().setFromPoints([source, target])
      const highlighted = highlightedNodeIds.has(edge.from) || highlightedNodeIds.has(edge.to)
      group.add(new THREE.Line(geometry, highlighted ? highlightEdgeMaterial : edgeMaterial))
    }

    for (const node of graph.nodes) {
      const position = graph.positions.get(node.slug)
      if (!position) continue
      const highlighted = highlightedNodeIds.has(node.slug)
      const radius = highlighted ? 0.2 : node.degree > 2 ? 0.17 : 0.11
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 28, 18), highlighted ? highlightMaterial : materialForNode(node, material, hubMaterial, sourceMaterial, artifactMaterial))
      mesh.position.copy(position)
      mesh.userData['slug'] = node.slug
      group.add(mesh)
      nodeMeshes.push({ slug: node.slug, mesh })
    }

    const labels = [...graph.nodes]
      .sort((a, b) => b.degree - a.degree)
      .slice(0, 5)
      .map((node) => {
        const label = document.createElement('button')
        label.className = 'graph-label'
        if (highlightedNodeIds.has(node.slug)) label.classList.add('graph-label-highlight')
        label.textContent = node.title
        label.type = 'button'
        label.onclick = () => onSelect?.(node.slug)
        host.appendChild(label)
        return { node, label }
      })

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    const onClick = (event: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)
      const hit = raycaster.intersectObjects(nodeMeshes.map((item) => item.mesh))[0]
      const slug = hit?.object.userData['slug']
      if (typeof slug === 'string') onSelect?.(slug)
    }
    const onPointerMove = (event: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)
      renderer.domElement.style.cursor = raycaster.intersectObjects(nodeMeshes.map((item) => item.mesh)).length > 0 ? 'pointer' : 'grab'
    }
    renderer.domElement.addEventListener('click', onClick)
    renderer.domElement.addEventListener('pointermove', onPointerMove)

    const resize = new ResizeObserver(() => {
      const width = host.clientWidth
      const height = host.clientHeight
      renderer.setSize(width, height)
      camera.aspect = width / Math.max(height, 1)
      camera.updateProjectionMatrix()
    })
    resize.observe(host)

    let frame = 0
    let raf = 0
    const animate = () => {
      frame += 0.01
      group.rotation.y = Math.sin(frame * 0.5) * 0.18
      group.rotation.x = Math.cos(frame * 0.38) * 0.08
      for (const { node, label } of labels) {
        const position = graph.positions.get(node.slug)
        if (!position) continue
        const projected = position.clone().applyMatrix4(group.matrixWorld).project(camera)
        label.style.left = `${(projected.x * 0.5 + 0.5) * host.clientWidth}px`
        label.style.top = `${(-projected.y * 0.5 + 0.5) * host.clientHeight}px`
      }
      renderer.render(scene, camera)
      raf = requestAnimationFrame(animate)
    }
    animate()

    return () => {
      cancelAnimationFrame(raf)
      resize.disconnect()
      renderer.domElement.removeEventListener('click', onClick)
      renderer.domElement.removeEventListener('pointermove', onPointerMove)
      for (const { label } of labels) label.remove()
      for (const { mesh } of nodeMeshes) mesh.geometry.dispose()
      renderer.dispose()
      host.removeChild(renderer.domElement)
    }
  }, [graph, highlightedNodeIds, onSelect])

  return <div ref={hostRef} className="knowledge-graph-3d" />
}

function layoutGraph(nodes: GraphNode[], edges: GraphEdge[]) {
  const positions = new Map<string, THREE.Vector3>()
  const normalizedEdges = edges.map((edge) => ({ from: stripGraphPrefix(edge.from ?? edge.source ?? ''), to: stripGraphPrefix(edge.to ?? edge.target ?? '') })).filter((edge) => edge.from && edge.to)
  const nodeDegrees = new Map(nodes.map((node) => [node.slug, 0]))
  for (const edge of normalizedEdges) {
    nodeDegrees.set(edge.from, (nodeDegrees.get(edge.from) ?? 0) + 1)
    nodeDegrees.set(edge.to, (nodeDegrees.get(edge.to) ?? 0) + 1)
  }
  const sortedNodes = [...nodes].sort((a, b) => (nodeDegrees.get(b.slug) ?? b.degree) - (nodeDegrees.get(a.slug) ?? a.degree) || a.slug.localeCompare(b.slug))
  const count = Math.max(nodes.length, 1)
  sortedNodes.forEach((node, index) => {
    const angle = (index / count) * Math.PI * 2
    const layer = index % 3
    const degree = nodeDegrees.get(node.slug) ?? node.degree
    const radius = 2.2 + layer * 0.82 + Math.min(degree, 5) * 0.11
    positions.set(node.slug, new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius * 0.72, (layer - 1) * 0.62))
  })
  for (let iteration = 0; iteration < 80; iteration += 1) {
    for (const edge of normalizedEdges) {
      const source = positions.get(edge.from)
      const target = positions.get(edge.to)
      if (!source || !target) continue
      const middle = source.clone().add(target).multiplyScalar(0.5)
      source.lerp(middle, 0.012)
      target.lerp(middle, 0.012)
    }
  }
  return { nodes: sortedNodes.map((node) => ({ ...node, degree: nodeDegrees.get(node.slug) ?? node.degree })), edges: normalizedEdges, positions }
}

function stripGraphPrefix(value: string) {
  return value.replace(/^(page|source|concept|artifact):/, '')
}

function materialForNode(
  node: GraphNode,
  pageMaterial: THREE.Material,
  hubMaterial: THREE.Material,
  sourceMaterial: THREE.Material,
  artifactMaterial: THREE.Material
) {
  if (node.kind === 'source' || node.slug.startsWith('source:')) return sourceMaterial
  if (node.kind === 'artifact' || node.slug.startsWith('artifact:')) return artifactMaterial
  return node.degree > 2 ? hubMaterial : pageMaterial
}
