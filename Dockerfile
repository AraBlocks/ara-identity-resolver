FROM arablocks/ann
WORKDIR /opt/ann/identity-resolver
ADD . /opt/ann/identity-resolver
ENTRYPOINT [ "ann",  "-t", "." ]
