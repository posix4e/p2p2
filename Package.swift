// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "P2P2",
    platforms: [
        .iOS(.v17),
        .macOS(.v14)
    ],
    products: [
        .library(
            name: "P2P2",
            targets: ["P2P2"]),
        .executable(
            name: "p2p2-cli",
            targets: ["P2P2CLI"])
    ],
    dependencies: [
        .package(url: "https://github.com/stasel/WebRTC", exact: "137.0.0")
    ],
    targets: [
        .target(
            name: "P2P2",
            dependencies: [
                .product(name: "WebRTC", package: "WebRTC")
            ]),
        .executableTarget(
            name: "P2P2CLI",
            dependencies: ["P2P2"]),
        .testTarget(
            name: "P2P2Tests",
            dependencies: ["P2P2"])
    ]
)
