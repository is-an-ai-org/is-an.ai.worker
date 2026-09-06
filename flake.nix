{
  description = "Is An AI Environment";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs";

  outputs = { self, nixpkgs }: 
  let
    pkgs = import nixpkgs { system = "aarch64-darwin"; };
    node = pkgs.nodejs_22;
  in {
    devShells.aarch64-darwin.default = pkgs.mkShell {
      buildInputs = [
        node
        pkgs.zip
      ];
      
      shellHook = ''
        echo "Is An AI Environment"
        echo "Node $(${node}/bin/node --version)"
      '';
    };
  };
}
