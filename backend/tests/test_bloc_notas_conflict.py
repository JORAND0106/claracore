"""Conflicto del bloc: copia solo entre dispositivos distintos."""


def should_create_conflict_copy(
    *,
    server_rev,
    base_rev,
    deleted=False,
    server_device_id=None,
    client_device_id=None,
):
    if deleted:
        return False
    if server_rev is None or base_rev is None:
        return False
    if not (int(server_rev) > int(base_rev)):
        return False
    a = str(server_device_id or "")
    b = str(client_device_id or "")
    if not a or not b:
        return False
    if a == b:
        return False
    return True


def test_same_device_never_copies():
    assert should_create_conflict_copy(
        server_rev=5,
        base_rev=2,
        server_device_id="ipad",
        client_device_id="ipad",
    ) is False


def test_first_upload_base_rev_none():
    assert should_create_conflict_copy(
        server_rev=1,
        base_rev=None,
        server_device_id="a",
        client_device_id="b",
    ) is False


def test_real_multi_device_conflict():
    assert should_create_conflict_copy(
        server_rev=5,
        base_rev=2,
        server_device_id="android",
        client_device_id="ipad",
    ) is True
